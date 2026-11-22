export function createSosWorker({ db, telegram, now = () => new Date() }) {
  async function eligible(job) {
    if(job.expiresAt <= now())return {error:"NOTICE_EXPIRED"};
    const contact=await db.one("EmergencyContact",{_id:job.contactId,patientId:job.patientId,recipientUserId:job.recipientId,status:"active"});
    const incident=await db.one("SosIncident",{_id:job.incidentId,patientId:job.patientId});
    const patient=await db.one("Patient",{_id:job.patientId,status:"active"});
    if(!contact||!incident||!patient||contact.consentVersion!==job.contactConsentVersion)return {error:"CONTACT_OR_INCIDENT_UNAVAILABLE"};
    if(job.kind==="alert") {
      if(incident.status!=="active")return {error:"INCIDENT_CLOSED"};
      if(await db.one("SosAcknowledgement",{incidentId:job.incidentId,contactId:job.contactId}))return {error:"ALREADY_ACKNOWLEDGED"};
    }else if(incident.status!==job.kind)return {error:"INCIDENT_CHANGED"};
    const link=await db.one("ChannelLink",{_id:job.channelLinkId||null,userId:job.recipientId,revokedAt:null});
    if(!link||link.revision!==job.channelRevision)return {error:"NOT_LINKED"};
    return {link};
  }
  async function deliverOne() {
    // A crashed send might already have reached Telegram. Never automatically resend it.
    const expired = (
      await db.list(
        "SosJob",
        { status: "processing", leaseUntil: { $lt: now() } },
        1,
      )
    )[0];
    if (expired)
      await db.transaction(async (s) => {
        const old = await db.update(
          "SosJob",
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
            "SosAttempt",
            { jobId: old._id, attemptNumber: old.attemptCount },
            s,
          );
          if (attempt)
            await db.update(
              "SosAttempt",
              { _id: attempt._id },
              { status: "unknown", errorCode: "WORKER_INTERRUPTED" },
              s,
            );
        }
      });
    if (!telegram.enabled) {
      const pending=(await db.list("SosJob",{status:"pending"},1))[0];
      if(!pending)return false;
      await db.update("SosJob",{_id:pending._id,revision:pending.revision,status:"pending"},{status:"disabled",errorCode:"NOT_CONFIGURED"});
      return true;
    }
    const next = (
      await db.list(
        "SosJob",
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
        "SosJob",
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
          "SosAttempt",
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
        messageId = (await telegram.sendSosNotice(permission.link.chatId, claimed.kind))
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
        "SosJob",
        { _id: claimed._id, revision: claimed.revision, status: "processing" },
        { status: state, errorCode, leaseUntil: null },
        s,
      );
      if (updated)
        await db.update(
          "SosAttempt",
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
  return {queueDue:async()=>0,deliverOne};
}
