import { randomBytes, createHash } from "node:crypto";
const hash = (value) => createHash("sha256").update(value).digest("hex");
const mask = (value) => "…" + String(value).slice(-4);
export function installChannels(
  app,
  {
    db,
    authenticated,
    csrf,
    mutate,
    object,
    fail,
    id,
    telegram,
    now,
    throttle,
  },
) {
  app.get("/me/channel-links", authenticated, async (req, res) => {
    const links = await db.list(
        "ChannelLink",
        { userId: req.actorId, revokedAt: null },
        2,
      ),
      challenges = await db.list(
        "ChannelChallenge",
        {
          userId: req.actorId,
          expiresAt: { $gt: now() },
          status: { $in: ["pending", "proposed"] },
        },
        5,
      ),
      worker = await db.one("WorkerState", { name: "telegram" });
    res.json({
      data: {
        configured: telegram.enabled,
        botUsername: telegram.username,
        workerLastActiveAt: worker?.lastActiveAt || null,
        links: links.map((l) => ({
          id: String(l._id),
          provider: "telegram",
          revision: l.revision,
          accountHint: mask(l.telegramUserId),
          consentedAt: l.consentedAt,
        })),
        challenges: challenges.map((c) => ({
          id: String(c._id),
          revision: c.revision,
          status: c.status,
          expiresAt: c.expiresAt,
          accountHint: c.telegramUserId ? mask(c.telegramUserId) : null,
        })),
      },
      meta: { requestId: req.requestId },
    });
  });
  app.post(
    "/me/channel-link-challenges",
    authenticated,
    csrf,
    throttle,
    async (req, res) => {
      const b = object(req.body, ["provider"], ["provider"]);
      if (b.provider !== "telegram")
        fail(422, "VALIDATION_ERROR", "Choose Telegram.");
      if (!telegram.enabled)
        fail(
          503,
          "TELEGRAM_NOT_CONFIGURED",
          "Telegram is not configured. Task workflows remain available.",
        );
      let issued;
      await mutate(
        req,
        res,
        null,
        async (s) => {
          if (
            await db.one(
              "ChannelLink",
              { userId: req.actorId, revokedAt: null },
              s,
            )
          )
            fail(
              409,
              "ALREADY_LINKED",
              "Unlink the current Telegram account first.",
            );
          const recent = await db.list(
            "ChannelChallenge",
            { userId: req.actorId, expiresAt: { $gt: now() } },
            6,
            s,
          );
          if (recent.length >= 5)
            fail(
              429,
              "RATE_LIMITED",
              "Wait for an earlier challenge to expire.",
            );
          const token = randomBytes(32).toString("hex"),
            expiresAt = new Date(now().getTime() + 600000);
          const c = await db.insert(
            "ChannelChallenge",
            {
              userId: req.actorId,
              tokenHash: hash(token),
              expiresAt,
              status: "pending",
            },
            s,
          );
          // No raw linking code in the database, operation replay, audit or logs.
          issued = { id: String(c._id), token };
          return { id: String(c._id), revision: c.revision, expiresAt };
        },
        201,
        undefined,
        (data) => ({
          ...data,
          challengeUrl:
            issued?.id === data.id
              ? `https://t.me/${telegram.username}?start=${issued.token}`
              : null,
        }),
      );
    },
  );
  app.post(
    "/me/channel-link-challenges/:challengeId/confirm",
    authenticated,
    csrf,
    async (req, res) => {
      const b = object(
        req.body,
        ["expectedRevision", "consent"],
        ["expectedRevision", "consent"],
      );
      if (b.consent !== true || !Number.isInteger(b.expectedRevision))
        fail(
          422,
          "VALIDATION_ERROR",
          "Explicit Telegram notice consent and latest revision are required.",
        );
      await mutate(
        req,
        res,
        null,
        async (s) => {
          const c = await db.one(
            "ChannelChallenge",
            {
              _id: id(req.params.challengeId),
              userId: req.actorId,
              status: "proposed",
              expiresAt: { $gt: now() },
            },
            s,
          );
          if (!c)
            fail(
              409,
              "LINK_NOT_READY",
              "Refresh linking status. Start the bot and confirm before expiry.",
            );
          const used = await db.update(
            "ChannelChallenge",
            { _id: c._id, revision: b.expectedRevision, status: "proposed" },
            { status: "used" },
            s,
          );
          if (!used) fail(409, "REVISION_CONFLICT", "Refresh linking status.");
          const old = await db.one("ChannelLink", { userId: req.actorId }, s);
          if (old && !old.revokedAt)
            fail(
              409,
              "ALREADY_LINKED",
              "Unlink your current Telegram account first.",
            );
          const fields = {
            telegramUserId: c.telegramUserId,
            chatId: c.chatId,
            consentedAt: now(),
            revokedAt: null,
          };
          const link = old
            ? await db.update(
                "ChannelLink",
                { _id: old._id, revision: old.revision },
                fields,
                s,
              )
            : await db.insert(
                "ChannelLink",
                { userId: req.actorId, ...fields },
                s,
              );
          return {
            id: String(link._id),
            provider: "telegram",
            revision: link.revision,
            accountHint: mask(link.telegramUserId),
            consentedAt: link.consentedAt,
          };
        },
        200,
      );
    },
  );
  app.delete(
    "/me/channel-links/:linkId",
    authenticated,
    csrf,
    async (req, res) => {
      req.body ??= {};
      object(req.body, [], []);
      await mutate(
        req,
        res,
        null,
        async (s) => {
          const l = await db.one(
            "ChannelLink",
            { _id: id(req.params.linkId), userId: req.actorId },
            s,
          );
          if (!l) fail(404, "NOT_FOUND", "Record not found.");
          if (!l.revokedAt)
            await db.update(
              "ChannelLink",
              { _id: l._id, revision: l.revision },
              { revokedAt: now() },
              s,
            );
          return { unlinked: true };
        },
        200,
      );
    },
  );
}

// Only the trusted polling worker calls this, never an unauthenticated HTTP route.
export async function handleTelegramUpdate(db, update, now = () => new Date()) {
  if (!Number.isSafeInteger(update?.update_id) || update.update_id < 0) return;
  try {
    await db.transaction(async (s) => {
      if (await db.one("TelegramReceipt", { updateId: update.update_id }, s))
        return;
      await db.insert("TelegramReceipt", { updateId: update.update_id }, s);
      const m = update.message;
      if (
        m?.chat?.type !== "private" ||
        m.from?.is_bot !== false ||
        !Number.isSafeInteger(m.from.id) ||
        m.from.id <= 0 ||
        m.chat.id !== m.from.id ||
        typeof m.text !== "string"
      )
        return;
      if (m.text === "/stop") {
        const l = await db.one(
          "ChannelLink",
          {
            telegramUserId: String(m.from.id),
            chatId: String(m.chat.id),
            revokedAt: null,
          },
          s,
        );
        if (l)
          await db.update(
            "ChannelLink",
            { _id: l._id, revision: l.revision },
            { revokedAt: now() },
            s,
          );
        return;
      }
      const match = /^\/start ([a-f0-9]{64})$/.exec(m.text);
      if (!match) return;
      const c = await db.one(
        "ChannelChallenge",
        {
          tokenHash: hash(match[1]),
          status: "pending",
          expiresAt: { $gt: now() },
        },
        s,
      );
      if (c)
        await db.update(
          "ChannelChallenge",
          { _id: c._id, revision: c.revision, status: "pending" },
          {
            status: "proposed",
            telegramUserId: String(m.from.id),
            chatId: String(m.chat.id),
          },
          s,
        );
    });
  } catch (e) {
    if (e.code !== 11000) throw e;
  }
}
