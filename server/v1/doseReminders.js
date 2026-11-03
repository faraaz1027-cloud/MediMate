export const REMINDER_WINDOW_MS = 60 * 60000;
export const MAX_REMINDER_ATTEMPTS = 3;

// Uses separate collections so the C1 task worker cannot claim a dose notice.
export function createDoseWorker({ db, telegram, now = () => new Date() }) {
  async function heartbeat() {
    let row = await db.one("WorkerState", { name: "dose-reminders" });
    if (!row)
      try {
        row = await db.insert("WorkerState", {
          name: "dose-reminders",
          cursor: null,
          lastActiveAt: now(),
        });
      } catch (e) {
        if (e.code !== 11000) throw e;
        row = await db.one("WorkerState", { name: "dose-reminders" });
      }
    return row;
  }
  async function queueDue() {
    const state = await heartbeat(),
      settings = await db.list(
        "DoseReminderSettings",
        {
          enabled: true,
          ...(state.cursor ? { _id: { $gt: state.cursor } } : {}),
        },
        100,
        undefined,
        { _id: 1 },
      );
    let queued = 0;
    for (const setting of settings) {
      const doses = await db.list(
        "DoseOccurrence",
        {
          patientId: setting.patientId,
          state: "pending",
          reminderDueAtUTC: { $lte: now() },
          $expr: {
            $ne: [
              { $ifNull: ["$reminderQueuedRevision", -1] },
              "$actionRevision",
            ],
          },
        },
        50,
        undefined,
        { reminderDueAtUTC: 1, _id: 1 },
      );
      for (const dose of doses)
        try {
          const created = await db.transaction(async (s) => {
            const pref = await db.one(
                "DoseReminderSettings",
                { _id: setting._id, enabled: true },
                s,
              ),
              d = await db.one(
                "DoseOccurrence",
                {
                  _id: dose._id,
                  state: "pending",
                  reminderDueAtUTC: { $lte: now() },
                },
                s,
              );
            if (!pref || !d || d.reminderQueuedRevision === d.actionRevision)
              return false;
            const patient = await db.one(
              "Patient",
              { _id: d.patientId, status: "active" },
              s,
            );
            if (
              !patient ||
              String(patient.ownerUserId) !== String(pref.ownerUserId)
            )
              return false;
            const link = await db.one(
                "ChannelLink",
                { userId: patient.ownerUserId, revokedAt: null },
                s,
              ),
              expiresAtUTC = new Date(
                d.reminderDueAtUTC.getTime() + REMINDER_WINDOW_MS,
              ),
              expired = expiresAtUTC <= now();
            await db.insert(
              "DoseReminderJob",
              {
                patientId: d.patientId,
                occurrenceId: d._id,
                recipientId: patient.ownerUserId,
                actionRevision: d.actionRevision,
                settingsRevision: pref.revision,
                channelLinkId: link?._id,
                channelRevision: link?.revision,
                status: expired
                  ? "expired"
                  : telegram.enabled
                    ? "pending"
                    : "disabled",
                errorCode: expired
                  ? "WINDOW_EXPIRED"
                  : telegram.enabled
                    ? null
                    : "NOT_CONFIGURED",
                attemptCount: 0,
                runAtUTC: d.reminderDueAtUTC,
                expiresAtUTC,
              },
              s,
            );
            const marked = await db.update(
              "DoseOccurrence",
              {
                _id: d._id,
                revision: d.revision,
                state: "pending",
                actionRevision: d.actionRevision,
              },
              { reminderQueuedRevision: d.actionRevision },
              s,
            );
            if (!marked) throw Error("Dose queue projection changed.");
            return true;
          });
          if (created) queued++;
        } catch (e) {
          if (e.code !== 11000) throw e;
        }
    }
    await db.update(
      "WorkerState",
      { _id: state._id, revision: state.revision },
      {
        lastActiveAt: now(),
        cursor: settings.length === 100 ? settings.at(-1)._id : null,
      },
    );
    return queued;
  }
  async function eligibility(job) {
    if (job.expiresAtUTC <= now())
      return { status: "expired", error: "WINDOW_EXPIRED" };
    const d = await db.one("DoseOccurrence", {
      _id: job.occurrenceId,
      patientId: job.patientId,
    });
    if (
      !d ||
      d.state !== "pending" ||
      d.actionRevision !== job.actionRevision ||
      d.reminderDueAtUTC.getTime() !== job.runAtUTC.getTime()
    )
      return { error: "DOSE_CHANGED" };
    const patient = await db.one("Patient", {
        _id: job.patientId,
        ownerUserId: job.recipientId,
        status: "active",
      }),
      schedule = await db.one("Schedule", {
        _id: d.scheduleId,
        patientId: job.patientId,
        status: "active",
      }),
      cabinet = await db.one("CabinetItem", {
        _id: d.cabinetItemId,
        patientId: job.patientId,
        status: "active",
      });
    if (!patient || !schedule || !cabinet) return { error: "RECORD_INACTIVE" };
    const pref = await db.one("DoseReminderSettings", {
      patientId: job.patientId,
      ownerUserId: job.recipientId,
      enabled: true,
    });
    if (!pref || pref.revision !== job.settingsRevision)
      return { error: "CONSENT_CHANGED" };
    const link = await db.one("ChannelLink", {
      _id: job.channelLinkId || null,
      userId: job.recipientId,
      revokedAt: null,
    });
    if (!link || link.revision !== job.channelRevision)
      return { error: "NOT_LINKED" };
    return { link };
  }
  async function deliverOne() {
    // A crash after provider acceptance is uncertain, never an invitation to resend.
    let recovered = false;
    const interrupted = (
      await db.list(
        "DoseReminderJob",
        { status: "processing", leaseUntil: { $lte: now() } },
        1,
        undefined,
        { leaseUntil: 1, _id: 1 },
      )
    )[0];
    if (interrupted)
      await db.transaction(async (s) => {
        const job = await db.update(
          "DoseReminderJob",
          {
            _id: interrupted._id,
            revision: interrupted.revision,
            status: "processing",
          },
          {
            status: "unknown",
            errorCode: "WORKER_INTERRUPTED",
            leaseUntil: null,
          },
          s,
        );
        if (job) {
          await db.update(
            "DoseReminderAttempt",
            { jobId: job._id, attemptNumber: job.attemptCount },
            { status: "unknown", errorCode: "WORKER_INTERRUPTED" },
            s,
          );
          recovered = true;
        }
      });
    const next = (
      await db.list(
        "DoseReminderJob",
        { status: "pending", runAtUTC: { $lte: now() } },
        1,
        undefined,
        { runAtUTC: 1, _id: 1 },
      )
    )[0];
    if (!next) return recovered;
    // Reconcile persisted work even if configuration was removed during a
    // restart. Neither expiry nor a disabled adapter is a provider attempt.
    if (next.expiresAtUTC <= now() || !telegram.enabled) {
      const expired = next.expiresAtUTC <= now();
      const settled = await db.update(
        "DoseReminderJob",
        { _id: next._id, revision: next.revision, status: "pending" },
        {
          status: expired ? "expired" : "disabled",
          errorCode: expired ? "WINDOW_EXPIRED" : "NOT_CONFIGURED",
          leaseUntil: null,
        },
      );
      return !!settled || recovered;
    }
    let claimed, attempt;
    await db.transaction(async (s) => {
      claimed = await db.update(
        "DoseReminderJob",
        { _id: next._id, revision: next.revision, status: "pending" },
        {
          status: "processing",
          leaseUntil: new Date(now().getTime() + 60000),
          attemptCount: next.attemptCount + 1,
        },
        s,
      );
      if (claimed)
        attempt = await db.insert(
          "DoseReminderAttempt",
          {
            patientId: claimed.patientId,
            jobId: claimed._id,
            attemptNumber: claimed.attemptCount,
            attemptedAt: now(),
            status: "attempted",
          },
          s,
        );
    });
    if (!claimed) return recovered;
    const allowed = await eligibility(claimed);
    let status = allowed.error ? allowed.status || "suppressed" : "sent",
      errorCode = allowed.error || null,
      messageId;
    if (!allowed.error) {
      await db.update(
        "DoseReminderAttempt",
        { _id: attempt._id },
        { providerCallAt: now() },
      );
      try {
        messageId = (await telegram.sendDoseNotice(allowed.link.chatId))
          .messageId;
      } catch (e) {
        errorCode = [
          "RATE_LIMITED",
          "RECIPIENT_BLOCKED",
          "PROVIDER_REJECTED",
          "NOT_CONFIGURED",
          "OUTCOME_UNKNOWN",
          "RESPONSE_INVALID",
        ].includes(e.code)
          ? e.code
          : "OUTCOME_UNKNOWN";
        status =
          e.uncertain || errorCode === "OUTCOME_UNKNOWN" ? "unknown" : "failed";
      }
    }
    await db.transaction(async (s) => {
      const job = await db.update(
        "DoseReminderJob",
        { _id: claimed._id, revision: claimed.revision, status: "processing" },
        { status, errorCode, leaseUntil: null },
        s,
      );
      if (job)
        await db.update(
          "DoseReminderAttempt",
          { _id: attempt._id },
          {
            status: status === "sent" ? "accepted_by_channel" : status,
            errorCode,
            ...(messageId ? { externalMessageId: messageId } : {}),
          },
          s,
        );
    });
    return true;
  }
  return { queueDue, deliverOne };
}
