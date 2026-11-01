import { queueTaskNotice, recipientAllowed } from "./taskNotifications.js";

export function installTasks(
  patient,
  { db, csrf, scope, mutate, fail, id, object, text, publicDoc, now, telegram },
) {
  const invalid = (path, message) =>
    fail(422, "VALIDATION_ERROR", "Correct the highlighted fields.", [
      { path, message },
    ]);
  const revision = (v) => {
    if (!Number.isInteger(v) || v < 0)
      invalid("expectedRevision", "Use the latest integer revision.");
  };
  const owner = (req) =>
    String(req.patient.ownerUserId) === String(req.actorId);
  const manager = (req, t) =>
    owner(req) || String(t.createdByUserId) === String(req.actorId);
  const participant = (req, t) =>
    manager(req, t) || String(t.assigneeUserId) === String(req.actorId);
  patient.get("/task-assignees", scope("task.write"), async (req, res) => {
    const grants = await db.list(
      "AccessGrant",
      { patientId: req.patient._id, revokedAt: null },
      101,
    );
    if (grants.length > 100)
      fail(
        422,
        "ASSIGNEE_LIMIT",
        "Review assignee pagination with the project owner.",
      );
    const ids = [
      req.patient.ownerUserId,
      ...grants
        .filter(
          (g) =>
            g.permissions.includes("task.read") &&
            g.permissions.includes("task.write"),
        )
        .map((g) => g.userId),
    ];
    const users = await Promise.all(
      ids.map((userId) => db.one("User", { _id: userId })),
    );
    res.json({
      data: users
        .filter(Boolean)
        .map((u) => ({ id: String(u._id), displayName: u.displayName })),
      meta: { requestId: req.requestId },
    });
  });
  function date(value) {
    if (
      typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(value) ||
      !Number.isFinite(Date.parse(value)) ||
      new Date(value).toISOString().slice(0, 19) !== value.slice(0, 19)
    )
      invalid("dueAtUTC", "Enter a valid UTC due date.");
    return new Date(value);
  }
  async function assignee(req, userId, s) {
    if (!(await recipientAllowed(db, req.patient._id, userId, s)))
      fail(
        422,
        "ASSIGNEE_UNAUTHORIZED",
        "Choose an active caregiver with task permissions.",
        [
          {
            path: "assigneeUserId",
            message:
              "Choose the patient owner or an active caregiver with task.read and task.write.",
          },
        ],
      );
  }
  async function task(req, s) {
    const t = await db.one(
      "Task",
      { _id: id(req.params.taskId), patientId: req.patient._id },
      s,
    );
    if (!t) fail(404, "NOT_FOUND", "Record not found.");
    return t;
  }
  async function change(req, t, set, s) {
    const row = await db.update(
      "Task",
      {
        _id: t._id,
        patientId: req.patient._id,
        revision: req.body.expectedRevision,
      },
      set,
      s,
    );
    if (!row) fail(409, "REVISION_CONFLICT", "Reload the task and retry.");
    return row;
  }
  async function event(req, t, type, note, s, fromStatus) {
    return db.insert(
      "TaskEvent",
      {
        patientId: req.patient._id,
        taskId: t._id,
        actorUserId: req.actorId,
        eventType: type,
        text: note,
        occurredAt: now(),
        fromStatus,
        toStatus: t.status,
        snapshot: publicDoc(t),
      },
      s,
    );
  }
  function page(req, keys, filter) {
    if (
      Object.keys(req.query).some((k) => !keys.includes(k)) ||
      Object.values(req.query).some((v) => typeof v !== "string")
    )
      fail(400, "INVALID_QUERY", "Unsupported query.");
    const limit = req.query.limit === undefined ? 20 : Number(req.query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      fail(400, "INVALID_QUERY", "Limit must be 1–100.");
    if (req.query.cursor) {
      try {
        const c = JSON.parse(
            Buffer.from(req.query.cursor, "base64url").toString(),
          ),
          d = new Date(c.createdAt),
          ci = id(c.id);
        if (!Number.isFinite(d.getTime())) throw Error();
        filter.$or = [
          { createdAt: { $lt: d } },
          { createdAt: d, _id: { $lt: ci } },
        ];
      } catch {
        fail(400, "INVALID_CURSOR", "Invalid pagination cursor.");
      }
    }
    return limit;
  }
  function sendPage(req, res, rows, limit) {
    const more = rows.length > limit;
    rows.splice(limit);
    const last = rows.at(-1);
    res.json({
      data: rows.map(publicDoc),
      meta: {
        requestId: req.requestId,
        limit,
        nextCursor: more
          ? Buffer.from(
              JSON.stringify({
                id: String(last._id),
                createdAt: last.createdAt,
              }),
            ).toString("base64url")
          : null,
      },
    });
  }
  patient.get("/tasks", scope("task.read"), async (req, res) => {
    const filter = { patientId: req.patient._id },
      limit = page(
        req,
        ["status", "assigneeUserId", "limit", "cursor"],
        filter,
      );
    if (req.query.status) {
      if (
        !["open", "accepted", "completed", "cancelled"].includes(
          req.query.status,
        )
      )
        fail(400, "INVALID_QUERY", "Unknown status.");
      filter.status = req.query.status;
    }
    if (req.query.assigneeUserId)
      filter.assigneeUserId =
        req.query.assigneeUserId === "me"
          ? req.actorId
          : id(req.query.assigneeUserId);
    sendPage(req, res, await db.list("Task", filter, limit + 1), limit);
  });
  patient.get("/tasks/:taskId", scope("task.read"), async (req, res) =>
    res.json({
      data: publicDoc(await task(req)),
      meta: { requestId: req.requestId },
    }),
  );
  patient.post("/tasks", csrf, scope("task.write"), async (req, res) => {
    const b = object(
      req.body,
      [
        "title",
        "description",
        "assigneeUserId",
        "type",
        "dueAtUTC",
        "handoverNote",
      ],
      ["title", "assigneeUserId", "type"],
    );
    if (!["general", "refill"].includes(b.type))
      invalid("type", "Choose a task type.");
    const fields = {
      title: text(b.title, "title"),
      assigneeUserId: id(b.assigneeUserId),
      type: b.type,
      status: "open",
      assignmentGeneration: 0,
      createdByUserId: req.actorId,
    };
    if (b.description !== undefined)
      fields.description = text(b.description, "description", 2000);
    if (b.dueAtUTC !== undefined) fields.dueAtUTC = date(b.dueAtUTC);
    const note =
      b.handoverNote === undefined
        ? undefined
        : text(b.handoverNote, "handoverNote", 2000);
    await mutate(req, res, "task.write", async (s) => {
      await assignee(req, fields.assigneeUserId, s);
      const t = await db.insert(
          "Task",
          { ...fields, patientId: req.patient._id },
          s,
        ),
        e = await event(req, t, "created", note, s);
      await queueTaskNotice(db, t, e, telegram, s, now);
      return publicDoc(t);
    });
  });
  patient.patch(
    "/tasks/:taskId",
    csrf,
    scope("task.write"),
    async (req, res) => {
      const b = object(
        req.body,
        [
          "expectedRevision",
          "title",
          "description",
          "assigneeUserId",
          "dueAtUTC",
        ],
        ["expectedRevision"],
      );
      revision(b.expectedRevision);
      const set = {};
      if (
        !["title", "description", "assigneeUserId", "dueAtUTC"].some(
          (k) => b[k] !== undefined,
        )
      )
        invalid("title", "Change at least one field.");
      if (b.title !== undefined) set.title = text(b.title, "title");
      if (b.description !== undefined)
        set.description =
          b.description === "" ? "" : text(b.description, "description", 2000);
      if (b.assigneeUserId !== undefined)
        set.assigneeUserId = id(b.assigneeUserId);
      if (b.dueAtUTC !== undefined)
        set.dueAtUTC = b.dueAtUTC === null ? null : date(b.dueAtUTC);
      await mutate(
        req,
        res,
        "task.write",
        async (s) => {
          const old = await task(req, s);
          if (!manager(req, old))
            fail(
              403,
              "FORBIDDEN",
              "Only the creator or patient owner may edit or reassign this task.",
            );
          if (!["open", "accepted"].includes(old.status))
            fail(
              409,
              "INVALID_TRANSITION",
              "Reopen a completed task before editing.",
            );
          await assignee(req, set.assigneeUserId || old.assigneeUserId, s);
          const reassigned =
            set.assigneeUserId &&
            String(set.assigneeUserId) !== String(old.assigneeUserId);
          if (reassigned)
            Object.assign(set, {
              status: "open",
              assignmentGeneration: (old.assignmentGeneration || 0) + 1,
              acknowledgedAt: null,
              acknowledgedByUserId: null,
            });
          const t = await change(req, old, set, s),
            e = await event(
              req,
              t,
              reassigned ? "assigned" : "edited",
              undefined,
              s,
              old.status,
            );
          if (reassigned) await queueTaskNotice(db, t, e, telegram, s, now);
          return publicDoc(t);
        },
        200,
      );
    },
  );
  patient.post(
    "/tasks/:taskId/transitions",
    csrf,
    scope("task.write"),
    async (req, res) => {
      const b = object(
        req.body,
        ["expectedRevision", "action"],
        ["expectedRevision", "action"],
      );
      revision(b.expectedRevision);
      if (!["accept", "complete", "reopen"].includes(b.action))
        invalid("action", "Choose accept, complete or reopen.");
      await mutate(
        req,
        res,
        "task.write",
        async (s) => {
          const old = await task(req, s),
            reopen = b.action === "reopen";
          if (
            reopen
              ? !manager(req, old)
              : !owner(req) &&
                String(old.assigneeUserId) !== String(req.actorId)
          )
            fail(403, "FORBIDDEN", "This task action is not permitted.");
          const from = {
              accept: "open",
              complete: "accepted",
              reopen: "completed",
            }[b.action],
            to = { accept: "accepted", complete: "completed", reopen: "open" }[
              b.action
            ];
          if (old.status !== from)
            fail(
              409,
              "INVALID_TRANSITION",
              `Cannot ${b.action} a ${old.status} task.`,
            );
          await assignee(req, old.assigneeUserId, s);
          const t = await change(
              req,
              old,
              {
                status: to,
                ...(reopen
                  ? {
                      assignmentGeneration: (old.assignmentGeneration || 0) + 1,
                      acknowledgedAt: null,
                      acknowledgedByUserId: null,
                    }
                  : {}),
              },
              s,
            ),
            e = await event(
              req,
              t,
              { accept: "accepted", complete: "completed", reopen: "reopened" }[
                b.action
              ],
              undefined,
              s,
              old.status,
            );
          if (reopen) await queueTaskNotice(db, t, e, telegram, s, now);
          return publicDoc(t);
        },
        200,
      );
    },
  );
  patient.post(
    "/tasks/:taskId/notes",
    csrf,
    scope("task.write"),
    async (req, res) => {
      const b = object(req.body, ["text"], ["text"]),
        note = text(b.text, "text", 2000);
      await mutate(req, res, "task.write", async (s) => {
        const t = await task(req, s);
        if (!participant(req, t))
          fail(
            403,
            "FORBIDDEN",
            "Only task participants may add handover notes.",
          );
        return publicDoc(await event(req, t, "note", note, s));
      });
    },
  );
  patient.post(
    "/tasks/:taskId/acknowledgements",
    csrf,
    scope("task.write"),
    async (req, res) => {
      const b = object(req.body, ["expectedRevision"], ["expectedRevision"]);
      revision(b.expectedRevision);
      await mutate(
        req,
        res,
        "task.write",
        async (s) => {
          const old = await task(req, s);
          if (String(old.assigneeUserId) !== String(req.actorId))
            fail(
              403,
              "FORBIDDEN",
              "Only the current assignee may acknowledge this task.",
            );
          if (!["open", "accepted"].includes(old.status))
            fail(409, "INVALID_TRANSITION", "This task is not active.");
          if (old.acknowledgedAt)
            fail(
              409,
              "ALREADY_ACKNOWLEDGED",
              "This assignment was already acknowledged.",
            );
          const t = await change(
            req,
            old,
            { acknowledgedAt: now(), acknowledgedByUserId: req.actorId },
            s,
          );
          await db.insert(
            "Acknowledgement",
            {
              patientId: req.patient._id,
              taskId: t._id,
              generation: t.assignmentGeneration || 0,
              userId: req.actorId,
              acknowledgedAt: t.acknowledgedAt,
              mechanism: "authenticated_app",
            },
            s,
          );
          await event(req, t, "acknowledged", undefined, s);
          return publicDoc(t);
        },
        200,
      );
    },
  );
  patient.get(
    "/tasks/:taskId/history",
    scope("task.read"),
    async (req, res) => {
      await task(req);
      const filter = {
          patientId: req.patient._id,
          taskId: id(req.params.taskId),
        },
        limit = page(req, ["limit", "cursor"], filter);
      sendPage(req, res, await db.list("TaskEvent", filter, limit + 1), limit);
    },
  );
  patient.get(
    "/tasks/:taskId/notifications",
    scope("task.read"),
    async (req, res) => {
      await task(req);
      const filter = {
          patientId: req.patient._id,
          taskId: id(req.params.taskId),
        },
        limit = page(req, ["limit", "cursor"], filter),
        rows = await db.list("NotificationJob", filter, limit + 1);
      const more = rows.length > limit;
      rows.splice(limit);
      const last = rows.at(-1);
      const data = await Promise.all(
        rows.map(async (j) => ({
          id: String(j._id),
          recipientId: String(j.recipientId),
          generation: j.generation,
          status: j.status,
          errorCode: j.errorCode,
          attemptCount: j.attemptCount,
          createdAt: j.createdAt,
          attempts: (
            await db.list("NotificationAttempt", { jobId: j._id }, 3)
          ).map((a) => ({
            id: String(a._id),
            attemptNumber: a.attemptNumber,
            status: a.status,
            attemptedAt: a.attemptedAt,
            errorCode: a.errorCode,
          })),
        })),
      );
      res.json({
        data,
        meta: {
          requestId: req.requestId,
          nextCursor: more
            ? Buffer.from(
                JSON.stringify({
                  id: String(last._id),
                  createdAt: last.createdAt,
                }),
              ).toString("base64url")
            : null,
        },
      });
    },
  );
  patient.post(
    "/tasks/:taskId/notifications/:jobId/retry",
    csrf,
    scope("task.write"),
    async (req, res) => {
      object(req.body, [], []);
      if (!telegram.enabled)
        fail(503, "TELEGRAM_NOT_CONFIGURED", "Telegram is not configured.");
      await mutate(
        req,
        res,
        "task.write",
        async (s) => {
          const t = await task(req, s);
          if (!participant(req, t))
            fail(
              403,
              "FORBIDDEN",
              "Only task participants may retry a notice.",
            );
          const j = await db.one(
            "NotificationJob",
            {
              _id: id(req.params.jobId),
              taskId: t._id,
              patientId: req.patient._id,
            },
            s,
          );
          if (!j) fail(404, "NOT_FOUND", "Record not found.");
          if (
            !["failed", "disabled", "suppressed"].includes(j.status) ||
            j.attemptCount >= 3 ||
            t.acknowledgedAt ||
            !["open", "accepted"].includes(t.status) ||
            String(j.recipientId) !== String(t.assigneeUserId) ||
            j.generation !== (t.assignmentGeneration || 0)
          )
            fail(
              409,
              "RETRY_NOT_ALLOWED",
              "Only a definitively unsent current notice can be retried, up to three attempts. Unknown outcomes are not resent.",
            );
          await assignee(req, j.recipientId, s);
          const link = await db.one(
            "ChannelLink",
            { userId: j.recipientId, revokedAt: null },
            s,
          );
          if (!link)
            fail(
              409,
              "NOT_LINKED",
              "The assignee must link and consent to Telegram first.",
            );
          const row = await db.update(
            "NotificationJob",
            { _id: j._id, revision: j.revision, status: j.status },
            {
              status: "pending",
              errorCode: null,
              channelLinkId: link._id,
              channelRevision: link.revision,
              runAtUTC: now(),
            },
            s,
          );
          if (!row)
            fail(409, "REVISION_CONFLICT", "Refresh notifications and retry.");
          return { id: String(row._id), status: row.status };
        },
        200,
      );
    },
  );
}
