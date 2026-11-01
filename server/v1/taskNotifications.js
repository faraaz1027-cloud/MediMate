import { handleTelegramUpdate } from "./channels.js";

export async function recipientAllowed(db, patientId, userId, s) {
  const p = await db.one("Patient", { _id: patientId, status: "active" }, s);
  if (!p) return false;
  if (String(p.ownerUserId) === String(userId)) return true;
  const g = await db.one(
    "AccessGrant",
    { patientId, userId, revokedAt: null },
    s,
  );
  return (
    !!g?.permissions.includes("task.read") &&
    g.permissions.includes("task.write")
  );
}
export async function queueTaskNotice(db, task, event, telegram, s, now) {
  const link = await db.one(
    "ChannelLink",
    { userId: task.assigneeUserId, revokedAt: null },
    s,
  );
  await db.insert(
    "NotificationJob",
    {
      patientId: task.patientId,
      taskId: task._id,
      eventId: event._id,
      recipientId: task.assigneeUserId,
      generation: task.assignmentGeneration || 0,
      channelLinkId: link?._id,
      channelRevision: link?.revision,
      status: telegram.enabled ? "pending" : "disabled",
      errorCode: telegram.enabled ? null : "NOT_CONFIGURED",
      attemptCount: 0,
      runAtUTC: now(),
    },
    s,
  );
}
export function createTaskWorker({ db, telegram, now = () => new Date() }) {
  async function eligible(job) {
    const task = await db.one("Task", {
      _id: job.taskId,
      patientId: job.patientId,
    });
    if (
      !task ||
      !["open", "accepted"].includes(task.status) ||
      String(task.assigneeUserId) !== String(job.recipientId) ||
      (task.assignmentGeneration || 0) !== job.generation
    )
      return { error: "TASK_CHANGED" };
    if (task.acknowledgedAt) return { error: "ALREADY_ACKNOWLEDGED" };
    if (!(await recipientAllowed(db, job.patientId, job.recipientId)))
      return { error: "ACCESS_REVOKED" };
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
    // A crashed send might already have reached Telegram. Never automatically resend it.
    const expired = (
      await db.list(
        "NotificationJob",
        { status: "processing", leaseUntil: { $lt: now() } },
        1,
      )
    )[0];
    if (expired)
      await db.transaction(async (s) => {
        const old = await db.update(
          "NotificationJob",
          {
            _id: expired._id,
            revision: expired.revision,
            status: "processing",
          },
          {
            status: "unknown",
            errorCode: "WORKER_INTERRUPTED",
            leaseUntil: null,
          },
          s,
        );
        if (old) {
          const attempt = await db.one(
            "NotificationAttempt",
            { jobId: old._id, attemptNumber: old.attemptCount },
            s,
          );
          if (attempt)
            await db.update(
              "NotificationAttempt",
              { _id: attempt._id },
              { status: "unknown", errorCode: "WORKER_INTERRUPTED" },
              s,
            );
        }
      });
    if (!telegram.enabled) return false;
    const next = (
      await db.list(
        "NotificationJob",
        { status: "pending", runAtUTC: { $lte: now() } },
        1,
        undefined,
        { runAtUTC: 1, _id: 1 },
      )
    )[0];
    if (!next) return false;
    let claimed, attempt;
    await db.transaction(async (s) => {
      claimed = await db.update(
        "NotificationJob",
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
          "NotificationAttempt",
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
    if (!claimed) return false;
    let state = "sent",
      errorCode = null,
      messageId;
    const permission = await eligible(claimed);
    if (permission.error) {
      state = "suppressed";
      errorCode = permission.error;
    } else
      try {
        messageId = (await telegram.sendTaskNotice(permission.link.chatId))
          .messageId;
      } catch (e) {
        state = e.uncertain ? "unknown" : "failed";
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
        if (errorCode === "OUTCOME_UNKNOWN") state = "unknown";
      }
    await db.transaction(async (s) => {
      const updated = await db.update(
        "NotificationJob",
        { _id: claimed._id, revision: claimed.revision, status: "processing" },
        { status: state, errorCode, leaseUntil: null },
        s,
      );
      if (updated)
        await db.update(
          "NotificationAttempt",
          { _id: attempt._id },
          {
            status: state === "sent" ? "accepted_by_channel" : state,
            errorCode,
            ...(messageId ? { externalMessageId: messageId } : {}),
          },
          s,
        );
    });
    return true;
  }
  async function pollOnce() {
    if (!telegram.enabled) return;
    let state = await db.one("WorkerState", { name: "telegram" });
    if (!state) {
      try {
        state = await db.insert("WorkerState", { name: "telegram", offset: 0 });
      } catch (e) {
        if (e.code !== 11000) throw e;
        state = await db.one("WorkerState", { name: "telegram" });
      }
    }
    const updates = await telegram.updates(state.offset);
    let offset = state.offset;
    for (const u of updates) {
      if (!Number.isSafeInteger(u?.update_id) || u.update_id < 0) continue;
      await handleTelegramUpdate(db, u, now);
      offset = Math.max(offset, u.update_id + 1);
    }
    await db.update(
      "WorkerState",
      { _id: state._id, revision: state.revision },
      { offset, lastActiveAt: now() },
    );
  }
  return { deliverOne, pollOnce };
}
