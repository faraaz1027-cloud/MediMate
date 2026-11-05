import { Temporal } from "@js-temporal/polyfill";
import { createHash } from "node:crypto";
import { MAX_REMINDER_ATTEMPTS } from "./doseReminders.js";
import mongoose from "mongoose";
import { syncDoseStock } from "./stockLedger.js";

export function installDoses(
  patient,
  {
    db,
    csrf,
    scope,
    mutate,
    fail,
    id,
    object,
    text,
    publicDoc,
    now,
    send,
    telegram,
  },
) {
  const invalid = (path, message) =>
    fail(422, "VALIDATION_ERROR", "Correct the highlighted fields.", [
      { path, message },
    ]);
  const revision = (x, nullable = false) => {
    if (!(nullable && x === null) && (!Number.isInteger(x) || x < 0))
      invalid(
        "expectedRevision",
        "Reload and use the current action revision (null for new settings).",
      );
  };
  const ownerOnly = (req) => {
    if (String(req.patient.ownerUserId) !== String(req.actorId))
      fail(
        403,
        "FORBIDDEN",
        "Only the patient owner manages their reminder consent and retries.",
      );
  };
  const query = (req, fields) => {
    if (
      Object.keys(req.query).some((k) => !fields.includes(k)) ||
      Object.values(req.query).some((v) => typeof v !== "string")
    )
      fail(400, "INVALID_QUERY", "Unsupported query.");
  };
  function utc(value, path) {
    if (
      typeof value !== "string" ||
      !/^\d{4}-\d\d-\d\dT([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d{1,3})?Z$/.test(
        value,
      ) ||
      !Number.isFinite(Date.parse(value)) ||
      new Date(value).toISOString().slice(0, 19) !== value.slice(0, 19)
    )
      invalid(path, "Enter a valid explicit UTC timestamp ending in Z.");
    return new Date(value);
  }
  function page(req, filter, field = "createdAt", up = false) {
    const limit = req.query.limit === undefined ? 20 : Number(req.query.limit),
      signature = createHash("sha256")
        .update(JSON.stringify(filter))
        .digest("hex");
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      fail(400, "INVALID_QUERY", "Use limit 1–100.");
    if (req.query.cursor)
      try {
        const c = JSON.parse(
            Buffer.from(req.query.cursor, "base64url").toString(),
          ),
          date = new Date(c.time),
          op = up ? "$gt" : "$lt";
        if (
          c.signature !== signature ||
          !/^[a-f0-9]{24}$/.test(c.id) ||
          !Number.isFinite(date.getTime())
        )
          throw Error();
        filter.$or = [
          { [field]: { [op]: date } },
          { [field]: date, _id: { [op]: id(c.id) } },
        ];
      } catch {
        fail(
          400,
          "INVALID_CURSOR",
          "Reload the list after changing its filters.",
        );
      }
    return { limit, signature };
  }
  const pageMeta = (rows, p, field = "createdAt") => {
    const more = rows.length > p.limit;
    rows.splice(p.limit);
    const last = rows.at(-1);
    return {
      limit: p.limit,
      nextCursor: more
        ? Buffer.from(
            JSON.stringify({
              signature: p.signature,
              id: String(last._id),
              time: last[field],
            }),
          ).toString("base64url")
        : null,
    };
  };
  async function dose(req, s) {
    const d = await db.one(
      "DoseOccurrence",
      { _id: id(req.params.doseId), patientId: req.patient._id },
      s,
    );
    if (!d) fail(404, "NOT_FOUND", "Dose event not found.");
    return d;
  }
  async function projection(d, s) {
    const v = await db.one(
        "ScheduleVersion",
        { _id: d.scheduleVersionId, patientId: d.patientId },
        s,
      ),
      out = publicDoc(d);
    if (!v)
      fail(
        503,
        "SCHEDULE_UNAVAILABLE",
        "The saved schedule version is unavailable.",
      );
    delete out.revision;
    delete out.reminderQueuedRevision;
    delete out.stockActionId;
    delete out.stockDeductionId;
    return {
      ...out,
      medicineText: v.sourceSnapshot.medicineText,
      strengthText: v.sourceSnapshot.strengthText,
      overdueUnconfirmed: d.state === "pending" && d.dueAtUTC < now(),
      stockSyncStatus: d.stockSyncStatus ?? (d.state === "taken" ? "legacy_untracked" : "not_applicable"),
    };
  }
  const suppress = (d, s) =>
    db.updateMany(
      "DoseReminderJob",
      { occurrenceId: d._id, patientId: d.patientId, status: "pending" },
      { status: "suppressed", errorCode: "DOSE_CHANGED" },
      s,
    );
  function requestId(req) {
    const value = req.body.clientRequestId;
    if (
      typeof value !== "string" ||
      !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value) ||
      value !== req.get("Idempotency-Key")
    )
      invalid(
        "clientRequestId",
        "Use the same UUID for clientRequestId and Idempotency-Key.",
      );
  }
  async function perform(req, res, mode) {
    const allowed =
      mode === "action"
        ? ["expectedRevision", "action", "clientRequestId", "effectiveAt"]
        : mode === "snooze"
          ? ["expectedRevision", "minutes", "clientRequestId"]
          : ["expectedRevision", "newState", "reason", "clientRequestId"];
    const b = object(
      req.body,
      allowed,
      allowed.filter((k) => k !== "effectiveAt"),
    );
    revision(b.expectedRevision);
    requestId(req);
    if (mode === "action" && !["taken", "skipped"].includes(b.action))
      invalid("action", "Choose taken or skipped.");
    if (mode === "snooze" && b.minutes !== 10)
      invalid("minutes", "The supported snooze is 10 minutes.");
    if (
      mode === "correction" &&
      !["pending", "taken", "skipped"].includes(b.newState)
    )
      invalid("newState", "Choose pending, taken or skipped.");
    const reason = mode === "correction" ? text(b.reason, "reason", 500) : "",
      effectiveAt =
        b.effectiveAt === undefined ? null : utc(b.effectiveAt, "effectiveAt");
    await mutate(
      req,
      res,
      "dose.record",
      async (s) => {
        const d = await dose(req, s),
          at = now();
        if (d.actionRevision !== b.expectedRevision)
          fail(
            409,
            "REVISION_CONFLICT",
            "Reload the dose before recording another action.",
          );
        if (d.state === "cancelled")
          fail(
            409,
            "DOSE_CANCELLED",
            "A cancelled event cannot be recorded or corrected.",
          );
        if (d.dueAtUTC > at)
          fail(
            409,
            "DOSE_NOT_DUE",
            "This event is not due yet. Refresh when it reaches its saved time.",
          );
        if (effectiveAt && (effectiveAt > at || effectiveAt < d.dueAtUTC))
          invalid(
            "effectiveAt",
            "Use a time between the scheduled due time and the server's current time.",
          );
        const nextRevision = d.actionRevision + 1;
        let state = d.state,
          reminderDueAtUTC = d.reminderDueAtUTC,
          snoozeCount = d.snoozeCount,
          action;
        if (mode === "correction") {
          if (!["taken", "skipped"].includes(d.state) || b.newState === d.state)
            fail(
              409,
              "INVALID_CORRECTION",
              "Correct a taken/skipped record to a different state; prior history is retained.",
            );
          state = b.newState;
          action = state === "pending" ? "corrected_to_pending" : state;
        } else {
          if (d.state !== "pending")
            fail(
              409,
              "DOSE_ALREADY_RECORDED",
              "A terminal action already exists. Use a reasoned correction.",
            );
          if (mode === "snooze") {
            if (d.snoozeCount >= 3)
              fail(
                409,
                "SNOOZE_LIMIT",
                "This event already has three snoozes.",
              );
            if (d.reminderDueAtUTC > at)
              fail(
                409,
                "ALREADY_SNOOZED",
                "The current reminder is already deferred. Wait until it is due again.",
              );
            reminderDueAtUTC = new Date(at.getTime() + 10 * 60000);
            snoozeCount++;
            action = "snoozed";
          } else {
            state = b.action;
            action = state;
          }
        }
        const actionId = new mongoose.Types.ObjectId();
        const stock = await syncDoseStock(db, d, state, {
          actorUserId: req.actorId, sourceDoseActionId: actionId, recordedAt: at, note: reason,
        }, s);
        const updated = await db.update(
          "DoseOccurrence",
          {
            _id: d._id,
            patientId: d.patientId,
            actionRevision: b.expectedRevision,
            state: d.state,
          },
          {
            state,
            actionRevision: nextRevision,
            reminderDueAtUTC,
            snoozeCount,
            ...stock,
          },
          s,
        );
        if (!updated)
          fail(
            409,
            "REVISION_CONFLICT",
            "The dose changed. Reload before retrying.",
          );
        const entry = await db.insert(
          "DoseAction",
          {
            _id: actionId,
            patientId: d.patientId,
            occurrenceId: d._id,
            revisionNumber: nextRevision,
            action,
            previousState: d.state,
            newState: state,
            actorUserId: req.actorId,
            recordedAt: at,
            effectiveAt: effectiveAt || at,
            reason,
            isCorrection: mode === "correction",
            clientRequestId: b.clientRequestId,
            reminderDueAtUTC,
            stockSyncStatus: stock.stockSyncStatus,
          },
          s,
        );
        await suppress(d, s);
        return {
          dose: await projection(updated, s),
          actionId: String(entry._id),
          stockSyncStatus: stock.stockSyncStatus,
        };
      },
      200,
    );
  }
  patient.post(
    "/doses/:doseId/actions",
    csrf,
    scope("dose.record"),
    (req, res) => perform(req, res, "action"),
  );
  patient.post(
    "/doses/:doseId/snoozes",
    csrf,
    scope("dose.record"),
    (req, res) => perform(req, res, "snooze"),
  );
  patient.post(
    "/doses/:doseId/corrections",
    csrf,
    scope("dose.record"),
    (req, res) => perform(req, res, "correction"),
  );
  patient.get("/doses", scope("dose.read"), async (req, res) => {
    query(req, [
      "fromUTC",
      "toUTC",
      "date",
      "timezone",
      "state",
      "cursor",
      "limit",
    ]);
    const zone = req.query.timezone || req.patient.timezone;
    let from, to, date;
    try {
      if (typeof zone !== "string" || /^[+-]/.test(zone)) throw Error();
      Temporal.Now.instant().toZonedDateTimeISO(zone);
    } catch {
      invalid("timezone", "Use a valid named IANA timezone.");
    }
    if (req.query.fromUTC !== undefined || req.query.toUTC !== undefined) {
      if (req.query.date)
        invalid(
          "date",
          "Choose a local date or an explicit UTC range, not both.",
        );
      from = utc(req.query.fromUTC, "fromUTC");
      to = utc(req.query.toUTC, "toUTC");
    } else {
      date =
        req.query.date ||
        Temporal.Instant.from(now().toISOString())
          .toZonedDateTimeISO(zone)
          .toPlainDate()
          .toString();
      try {
        if (!/^\d{4}-\d\d-\d\d$/.test(date)) throw Error();
        const day = Temporal.PlainDate.from(date);
        from = new Date(day.toZonedDateTime(zone).epochMilliseconds);
        to = new Date(
          day.add({ days: 1 }).toZonedDateTime(zone).epochMilliseconds,
        );
      } catch {
        invalid("date", "Choose a valid local calendar date.");
      }
    }
    if (to <= from || to - from > 31 * 86400000)
      invalid("toUTC", "Use a positive range of at most 31 elapsed days.");
    const range = {
        patientId: req.patient._id,
        dueAtUTC: { $gte: from, $lt: to },
      },
      filter = { ...range };
    if (req.query.state) {
      if (
        !["pending", "taken", "skipped", "cancelled"].includes(req.query.state)
      )
        fail(400, "INVALID_QUERY", "Unknown dose state.");
      filter.state = req.query.state;
    }
    const p = page(req, filter, "dueAtUTC", true),
      rows = await db.list("DoseOccurrence", filter, p.limit + 1, undefined, {
        dueAtUTC: 1,
        _id: 1,
      }),
      meta = pageMeta(rows, p, "dueAtUTC");
    const states = ["pending", "taken", "skipped", "cancelled"],
      counts = await Promise.all(
        states.map((state) => db.count("DoseOccurrence", { ...range, state })),
      );
    const summary = Object.fromEntries(
      states.map((state, i) => [state, counts[i]]),
    );
    summary.overdueUnconfirmed = await db.count("DoseOccurrence", {
      patientId: req.patient._id,
      state: "pending",
      dueAtUTC: {
        $gte: from,
        $lt: new Date(Math.min(to.getTime(), now().getTime())),
      },
    });
    send(req, res, await Promise.all(rows.map((d) => projection(d))), 200, {
      ...meta,
      summary,
      fromUTC: from,
      toUTC: to,
      date: date || null,
      timezone: zone,
      serverNow: now(),
    });
  });
  const actionRows = async (req) => {
    const filter = {
      patientId: req.patient._id,
      occurrenceId: id(req.params.doseId),
    };
    const p = page(req, filter),
      rows = await db.list("DoseAction", filter, p.limit + 1),
      meta = pageMeta(rows, p);
    return { rows: rows.map(publicDoc), meta };
  };
  async function jobProjection(job) {
    const attempts = await db.list(
      "DoseReminderAttempt",
      { jobId: job._id, patientId: job.patientId },
      MAX_REMINDER_ATTEMPTS,
      undefined,
      { attemptNumber: 1 },
    );
    return {
      id: String(job._id),
      revision: job.revision,
      actionRevision: job.actionRevision,
      status: job.status,
      errorCode: job.errorCode,
      attemptCount: job.attemptCount,
      runAtUTC: job.runAtUTC,
      expiresAtUTC: job.expiresAtUTC,
      recipient: "patient_owner",
      attempts: attempts.map((a) => ({
        attemptNumber: a.attemptNumber,
        attemptedAt: a.attemptedAt,
        providerCallAt: a.providerCallAt || null,
        status: a.status,
        errorCode: a.errorCode || null,
      })),
    };
  }
  async function jobRows(req) {
    const filter = {
        patientId: req.patient._id,
        occurrenceId: id(req.params.doseId),
      },
      p = page(req, filter),
      rows = await db.list("DoseReminderJob", filter, p.limit + 1),
      meta = pageMeta(rows, p);
    return { rows: await Promise.all(rows.map(jobProjection)), meta };
  }
  patient.get("/doses/:doseId", scope("dose.read"), async (req, res) => {
    query(req, []);
    const d = await dose(req),
      history = await actionRows(req),
      reminders = await jobRows(req);
    send(
      req,
      res,
      {
        dose: await projection(d),
        actions: history.rows,
        nextActionCursor: history.meta.nextCursor,
        reminders: reminders.rows,
        nextReminderCursor: reminders.meta.nextCursor,
      },
      200,
      { serverNow: now() },
    );
  });
  patient.get(
    "/doses/:doseId/actions",
    scope("dose.read"),
    async (req, res) => {
      query(req, ["cursor", "limit"]);
      await dose(req);
      const r = await actionRows(req);
      send(req, res, r.rows, 200, r.meta);
    },
  );
  patient.get(
    "/doses/:doseId/reminders",
    scope("dose.read"),
    async (req, res) => {
      query(req, ["cursor", "limit"]);
      await dose(req);
      const r = await jobRows(req);
      send(req, res, r.rows, 200, r.meta);
    },
  );
  async function settingsView(req, s) {
    const pref = await db.one(
        "DoseReminderSettings",
        { patientId: req.patient._id },
        s,
      ),
      link = await db.one(
        "ChannelLink",
        { userId: req.patient.ownerUserId, revokedAt: null },
        s,
      ),
      worker = await db.one("WorkerState", { name: "dose-reminders" }, s);
    return {
      enabled: pref?.enabled || false,
      revision: pref?.revision ?? null,
      consentedAt: pref?.consentedAt || null,
      recipient: "patient_owner",
      configured: telegram.enabled,
      channelLinked: !!link,
      workerLastActiveAt: worker?.lastActiveAt || null,
    };
  }
  patient.get(
    "/dose-reminder-settings",
    scope("dose.read"),
    async (req, res) => {
      query(req, []);
      send(req, res, await settingsView(req));
    },
  );
  patient.put(
    "/dose-reminder-settings",
    csrf,
    scope("dose.record"),
    async (req, res) => {
      ownerOnly(req);
      const b = object(
        req.body,
        ["expectedRevision", "enabled", "consent"],
        ["expectedRevision", "enabled"],
      );
      revision(b.expectedRevision, true);
      if (typeof b.enabled !== "boolean")
        invalid("enabled", "Choose enabled or disabled.");
      if (b.enabled && b.consent !== true)
        invalid(
          "consent",
          "Explicitly request generic dose reminders to the owner's linked private account.",
        );
      await mutate(
        req,
        res,
        "dose.record",
        async (s) => {
          const old = await db.one(
            "DoseReminderSettings",
            { patientId: req.patient._id },
            s,
          );
          if ((old?.revision ?? null) !== b.expectedRevision)
            fail(
              409,
              "REVISION_CONFLICT",
              "Reload reminder preferences first.",
            );
          if (old?.enabled === b.enabled) return settingsView(req, s);
          const values = {
            enabled: b.enabled,
            ...(b.enabled ? { consentedAt: now() } : {}),
          };
          if (old)
            await db.update(
              "DoseReminderSettings",
              { _id: old._id, revision: b.expectedRevision },
              values,
              s,
            );
          else
            await db.insert(
              "DoseReminderSettings",
              {
                patientId: req.patient._id,
                ownerUserId: req.actorId,
                ...values,
              },
              s,
            );
          await db.updateMany(
            "DoseReminderJob",
            { patientId: req.patient._id, status: "pending" },
            { status: "suppressed", errorCode: "CONSENT_CHANGED" },
            s,
          );
          return settingsView(req, s);
        },
        200,
      );
    },
  );
  patient.post(
    "/doses/:doseId/reminders/:jobId/retry",
    csrf,
    scope("dose.record"),
    async (req, res) => {
      ownerOnly(req);
      const b = object(req.body, ["expectedRevision"], ["expectedRevision"]);
      revision(b.expectedRevision);
      await mutate(
        req,
        res,
        "dose.record",
        async (s) => {
          const d = await dose(req, s),
            job = await db.one(
              "DoseReminderJob",
              {
                _id: id(req.params.jobId),
                patientId: req.patient._id,
                occurrenceId: d._id,
              },
              s,
            );
          if (!job) fail(404, "NOT_FOUND", "Reminder not found.");
          if (
            !["failed", "disabled", "suppressed"].includes(job.status) ||
            job.attemptCount >= MAX_REMINDER_ATTEMPTS ||
            job.expiresAtUTC <= now() ||
            d.state !== "pending" ||
            d.actionRevision !== job.actionRevision
          )
            fail(
              409,
              "RETRY_NOT_ALLOWED",
              "Only a definite unsent, current reminder within its window can be retried (maximum three attempts). Unknown/sent outcomes are not resent.",
            );
          const pref = await db.one(
              "DoseReminderSettings",
              { patientId: req.patient._id, enabled: true },
              s,
            ),
            link = await db.one(
              "ChannelLink",
              { userId: req.actorId, revokedAt: null },
              s,
            );
          if (!telegram.enabled || !pref || !link)
            fail(
              409,
              "CHANNEL_NOT_READY",
              "Enable reminder consent and configure/link Telegram before explicitly retrying.",
            );
          const updated = await db.update(
            "DoseReminderJob",
            { _id: job._id, revision: b.expectedRevision, status: job.status },
            {
              status: "pending",
              errorCode: null,
              settingsRevision: pref.revision,
              channelLinkId: link._id,
              channelRevision: link.revision,
            },
            s,
          );
          if (!updated)
            fail(
              409,
              "REVISION_CONFLICT",
              "Reload reminder history before retrying.",
            );
          return {
            id: String(updated._id),
            status: updated.status,
            revision: updated.revision,
          };
        },
        200,
      );
    },
  );
}
