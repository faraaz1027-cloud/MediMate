import { createHash, randomBytes } from "node:crypto";
import { normalizeSchedule } from "./schedule-time.js";

const hash = (x) => createHash("sha256").update(x).digest("hex"),
  decimal = (x) =>
    String(x)
      .replace(/^0+(?=\d)/, "")
      .replace(/(\.\d*?)0+$/, "$1")
      .replace(/\.$/, "");

export function installSchedules(
  patient,
  {
    db,
    csrf,
    scope,
    access,
    mutate,
    fail,
    id,
    object,
    text,
    publicDoc,
    now,
    send,
  },
) {
  const invalid = (path, message) =>
    fail(422, "VALIDATION_ERROR", "Correct the highlighted fields.", [
      { path, message },
    ]);
  const revision = (x) => {
    if (!Number.isInteger(x) || x < 0)
      invalid("expectedRevision", "Reload and use the current revision.");
  };
  const ref = (x, path) => {
    if (typeof x !== "string" || !/^[a-f0-9]{24}$/i.test(x))
      invalid(path, "Choose a valid record.");
    return id(x);
  };
  async function source(req, instructionId, cabinetId, s, fence = false) {
    await access(req, "prescription.read", s);
    await access(req, "cabinet.read", s);
    const line = await db.one(
      "PrescriptionInstruction",
      {
        _id: ref(instructionId, "prescriptionInstructionId"),
        patientId: req.patient._id,
      },
      s,
    );
    const version =
      line &&
      (await db.one(
        "PrescriptionVersion",
        {
          _id: line.prescriptionVersionId,
          patientId: req.patient._id,
          status: "confirmed",
        },
        s,
      ));
    const parent =
      version &&
      (await db.one(
        "Prescription",
        {
          _id: version.prescriptionId,
          patientId: req.patient._id,
          currentVersionId: version._id,
          status: "active",
        },
        s,
      ));
    if (
      !parent ||
      line.clarificationRequired ||
      !line.doseQuantity ||
      !line.doseUnit ||
      !line.frequencyText ||
      !line.durationText
    )
      invalid(
        "prescriptionInstructionId",
        "Choose a complete, current confirmed instruction; clarify unresolved instructions in A1 first.",
      );
    const cabinet = await db.one(
      "CabinetItem",
      {
        _id: ref(cabinetId, "cabinetItemId"),
        patientId: req.patient._id,
        status: "active",
      },
      s,
    );
    if (
      !cabinet ||
      (line.cabinetItemId && String(line.cabinetItemId) !== String(cabinet._id))
    )
      invalid(
        "cabinetItemId",
        "Choose the active same-patient medicine linked by A1, or explicitly review an unlinked instruction.",
      );
    if (fence) {
      // A real write creates a conflict with concurrent source edit/archive/confirmation.
      // The hidden fence does not change source content or its public revision.
      await db.fence("Prescription", { _id: parent._id }, s);
      await db.fence("CabinetItem", { _id: cabinet._id }, s);
    }
    const snapshot = {
      prescriptionId: String(parent._id),
      prescriptionVersionId: String(version._id),
      prescriptionRevision: parent.revision,
      instructionId: String(line._id),
      medicineText: line.medicineText,
      strengthText: line.strengthText || "",
      instructionsText: line.instructionsText,
      doseQuantity: String(line.doseQuantity),
      doseUnit: line.doseUnit,
      frequencyText: line.frequencyText,
      durationText: line.durationText,
      cabinetItemId: String(cabinet._id),
      cabinetRevision: cabinet.revision,
      cabinetName: cabinet.displayName,
      cabinetStrength: cabinet.strengthText || "",
    };
    return { snapshot, fingerprint: hash(JSON.stringify(snapshot)) };
  }
  async function schedule(req, s) {
    const row = await db.one(
      "Schedule",
      { _id: id(req.params.scheduleId), patientId: req.patient._id },
      s,
    );
    if (!row) fail(404, "NOT_FOUND", "Schedule not found.");
    return row;
  }
  async function current(row, s) {
    return db.one(
      "ScheduleVersion",
      { _id: row.currentVersionId, patientId: row.patientId },
      s,
    );
  }
  async function change(row, expectedRevision, values, s) {
    const updated = await db.update(
      "Schedule",
      { _id: row._id, patientId: row.patientId, revision: expectedRevision },
      values,
      s,
    );
    if (!updated)
      fail(
        409,
        "REVISION_CONFLICT",
        "Reload the schedule and review the latest version.",
      );
    return updated;
  }
  async function cancel(row, boundary, reason, s) {
    await db.updateMany(
      "DoseOccurrence",
      {
        patientId: row.patientId,
        scheduleId: row._id,
        state: "pending",
        dueAtUTC: { $gte: boundary },
      },
      { state: "cancelled", cancelledAt: now(), cancellationReason: reason },
      s,
    );
  }
  async function persist(row, version, events, s) {
    await db.insertMany(
      "DoseOccurrence",
      events.map((due) => ({
        patientId: row.patientId,
        scheduleId: row._id,
        scheduleVersionId: version._id,
        cabinetItemId: row.cabinetItemId,
        dueAtUTC: due,
        doseQuantitySnapshot: version.doseQuantity,
        doseUnitSnapshot: version.doseUnit,
        timezoneSnapshot: version.timezone,
        state: "pending",
        reminderDueAtUTC: due,
        snoozeCount: 0,
        actionRevision: 0,
      })),
      s,
    );
  }
  patient.post(
    "/schedule-previews",
    csrf,
    scope("schedule.write"),
    async (req, res) => {
      const required = [
        "prescriptionInstructionId",
        "cabinetItemId",
        "timingMode",
        "timezone",
        "doseQuantity",
        "doseUnit",
        "effectiveFromUTC",
        "endAtUTC",
        "reviewedAgainstSource",
      ];
      const b = object(
        req.body,
        [
          ...required,
          "localTimes",
          "intervalMinutes",
          "anchorAtUTC",
          "scheduleId",
          "expectedRevision",
        ],
        required,
      );
      if (b.scheduleId !== undefined) {
        ref(b.scheduleId, "scheduleId");
        revision(b.expectedRevision);
        const existing = await db.one("Schedule", {
          _id: id(b.scheduleId),
          patientId: req.patient._id,
        });
        if (
          !existing ||
          !["active", "paused"].includes(existing.status) ||
          existing.revision !== b.expectedRevision
        )
          fail(
            409,
            "REVISION_CONFLICT",
            "Only the latest active or paused schedule can be edited. Reload first.",
          );
        if (String(existing.cabinetItemId) !== b.cabinetItemId)
          invalid("cabinetItemId", "Use the schedule's existing medicine.");
      } else if (b.expectedRevision !== undefined)
        invalid("expectedRevision", "A revision needs a scheduleId.");
      const normalized = normalizeSchedule(b, invalid, now()),
        src = await source(req, b.prescriptionInstructionId, b.cabinetItemId);
      if (
        decimal(b.doseQuantity) !== decimal(src.snapshot.doseQuantity) ||
        b.doseUnit !== src.snapshot.doseUnit
      )
        invalid(
          "doseQuantity",
          "Quantity and unit must match the confirmed A1 instruction; correct A1 first if needed.",
        );
      const token = randomBytes(32).toString("hex"),
        expiresAt = new Date(now().getTime() + 15 * 60000);
      await db.insert("SchedulePreview", {
        patientId: req.patient._id,
        actorUserId: req.actorId,
        tokenHash: hash(token),
        expiresAt,
        payload: {
          ...normalized,
          ...src,
          prescriptionInstructionId: b.prescriptionInstructionId,
          cabinetItemId: b.cabinetItemId,
          scheduleId: b.scheduleId || null,
          expectedRevision: b.expectedRevision ?? null,
        },
      });
      send(req, res, {
        previewToken: token,
        expiresAt,
        input: normalized.input,
        sourceSnapshot: src.snapshot,
        occurrenceCount: normalized.events.length,
        occurrences: normalized.events,
        warnings: [
          "Review the full finite course below. Confirmation saves every event (maximum 90 days / 2000 events).",
          "Strength is source text, not quantity per dose. No clinical interpretation or reminder delivery is performed.",
        ],
      });
    },
  );
  async function consume(req, s, target) {
    if (req.body.confirmed !== true)
      invalid("confirmed", "Explicit confirmation is required.");
    const token = req.body.previewToken;
    if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token))
      invalid("previewToken", "Generate a new preview.");
    const preview = await db.one(
      "SchedulePreview",
      {
        tokenHash: hash(token),
        actorUserId: req.actorId,
        patientId: req.patient._id,
        expiresAt: { $gt: now() },
        consumedAt: null,
      },
      s,
    );
    if (!preview)
      fail(
        409,
        "PREVIEW_EXPIRED",
        "Preview expired or was used. Generate and review a new preview.",
      );
    const p = preview.payload;
    if (
      p.scheduleId !== (target ? String(target._id) : null) ||
      (target && p.expectedRevision !== req.body.expectedRevision)
    )
      fail(
        409,
        "PREVIEW_TARGET_CHANGED",
        "Generate a preview for this schedule revision.",
      );
    if (Date.parse(p.input.effectiveFromUTC) < now().getTime())
      fail(
        409,
        "PREVIEW_STALE",
        "The start is now in the past. Generate a new preview.",
      );
    const src = await source(
      req,
      p.prescriptionInstructionId,
      p.cabinetItemId,
      s,
      true,
    );
    if (src.fingerprint !== p.fingerprint)
      fail(
        409,
        "SOURCE_CHANGED",
        "Source changed after preview. Reload and review it again.",
      );
    const used = await db.update(
      "SchedulePreview",
      { _id: preview._id, consumedAt: null },
      { consumedAt: now() },
      s,
    );
    if (!used) fail(409, "PREVIEW_EXPIRED", "Preview was already used.");
    return p;
  }
  patient.post(
    "/schedules",
    csrf,
    scope("schedule.write"),
    async (req, res) => {
      object(
        req.body,
        ["previewToken", "confirmed"],
        ["previewToken", "confirmed"],
      );
      await mutate(req, res, "schedule.write", async (s) => {
        const p = await consume(req, s),
          row = await db.insert(
            "Schedule",
            {
              patientId: req.patient._id,
              cabinetItemId: id(p.cabinetItemId),
              prescriptionInstructionId: id(p.prescriptionInstructionId),
              status: "active",
            },
            s,
          );
        const version = await db.insert(
          "ScheduleVersion",
          {
            ...p.input,
            patientId: row.patientId,
            scheduleId: row._id,
            versionNumber: 1,
            prescriptionInstructionId: id(p.prescriptionInstructionId),
            confirmedByUserId: req.actorId,
            confirmedAt: now(),
            sourceSnapshot: p.snapshot,
            occurrenceCount: p.events.length,
          },
          s,
        );
        const updated = await change(
          row,
          row.revision,
          { currentVersionId: version._id },
          s,
        );
        await persist(updated, version, p.events, s);
        return { schedule: publicDoc(updated), version: publicDoc(version) };
      });
    },
  );
  patient.post(
    "/schedules/:scheduleId/versions",
    csrf,
    scope("schedule.write"),
    async (req, res) => {
      object(
        req.body,
        ["expectedRevision", "previewToken", "confirmed"],
        ["expectedRevision", "previewToken", "confirmed"],
      );
      revision(req.body.expectedRevision);
      await mutate(req, res, "schedule.write", async (s) => {
        const row = await schedule(req, s);
        if (
          !["active", "paused"].includes(row.status) ||
          row.revision !== req.body.expectedRevision
        )
          fail(409, "REVISION_CONFLICT", "Reload the schedule first.");
        const p = await consume(req, s, row),
          previous = await current(row, s);
        const version = await db.insert(
          "ScheduleVersion",
          {
            ...p.input,
            patientId: row.patientId,
            scheduleId: row._id,
            versionNumber: previous.versionNumber + 1,
            prescriptionInstructionId: id(p.prescriptionInstructionId),
            confirmedByUserId: req.actorId,
            confirmedAt: now(),
            sourceSnapshot: p.snapshot,
            occurrenceCount: p.events.length,
          },
          s,
        );
        // Cancel at the replacement boundary, including old versions beyond the new end.
        await cancel(row, new Date(p.input.effectiveFromUTC), "replaced", s);
        const updated = await change(
          row,
          req.body.expectedRevision,
          {
            status: "active",
            currentVersionId: version._id,
            prescriptionInstructionId: id(p.prescriptionInstructionId),
          },
          s,
        );
        await persist(updated, version, p.events, s);
        return { schedule: publicDoc(updated), version: publicDoc(version) };
      });
    },
  );
  patient.post(
    "/schedules/:scheduleId/pause",
    csrf,
    scope("schedule.write"),
    async (req, res) => {
      const b = object(
        req.body,
        ["expectedRevision", "reason"],
        ["expectedRevision"],
      );
      revision(b.expectedRevision);
      const reason =
        b.reason === undefined ? "" : text(b.reason, "reason", 500);
      await mutate(
        req,
        res,
        "schedule.write",
        async (s) => {
          const row = await schedule(req, s);
          if (row.status !== "active")
            fail(409, "INVALID_STATE", "Only active schedules can be paused.");
          const boundary = now();
          const updated = await change(
            row,
            b.expectedRevision,
            { status: "paused", pausedAt: boundary, pauseReason: reason },
            s,
          );
          await cancel(row, boundary, "paused", s);
          return publicDoc(updated);
        },
        200,
      );
    },
  );
  patient.post(
    "/schedules/:scheduleId/resume",
    csrf,
    scope("schedule.write"),
    async (req, res) => {
      const b = object(
        req.body,
        ["expectedRevision", "effectiveFromUTC"],
        ["expectedRevision", "effectiveFromUTC"],
      );
      revision(b.expectedRevision);
      await mutate(
        req,
        res,
        "schedule.write",
        async (s) => {
          const row = await schedule(req, s),
            previous = await current(row, s);
          if (row.status !== "paused")
            fail(409, "INVALID_STATE", "Only paused schedules can be resumed.");
          const input = {
            ...publicDoc(previous),
            effectiveFromUTC: b.effectiveFromUTC,
            reviewedAgainstSource: true,
          };
          if (input.timingMode === "interval") delete input.localTimes;
          const { events } = normalizeSchedule(input, invalid, now());
          if (
            Date.parse(b.effectiveFromUTC) < previous.effectiveFromUTC.getTime()
          )
            invalid(
              "effectiveFromUTC",
              "Resume cannot start before this version.",
            );
          const src = await source(
            req,
            String(previous.prescriptionInstructionId),
            String(row.cabinetItemId),
            s,
            true,
          );
          if (
            hash(JSON.stringify(src.snapshot)) !==
            hash(JSON.stringify(previous.sourceSnapshot))
          )
            fail(
              409,
              "SOURCE_CHANGED",
              "The source changed. Leave paused and preview a reviewed replacement version.",
            );
          const updated = await change(
            row,
            b.expectedRevision,
            { status: "active" },
            s,
          );
          for (const due of events) {
            // Restore only rows cancelled by pause. Taken/skipped/replaced rows are never revived.
            await db.update(
              "DoseOccurrence",
              {
                scheduleVersionId: previous._id,
                dueAtUTC: new Date(due),
                state: "cancelled",
                cancellationReason: "paused",
              },
              { state: "pending", cancelledAt: null, cancellationReason: "" },
              s,
            );
          }
          return publicDoc(updated);
        },
        200,
      );
    },
  );
  const paginate = (
    req,
    allowed,
    filter,
    field = "createdAt",
    ascending = false,
  ) => {
    if (
      Object.keys(req.query).some(
        (k) => ![...allowed, "limit", "cursor"].includes(k),
      )
    )
      fail(400, "INVALID_QUERY", "Unsupported query.");
    const limit = req.query.limit === undefined ? 20 : Number(req.query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      fail(400, "INVALID_QUERY", "Use limit 1–100.");
    if (req.query.cursor) {
      try {
        const c = JSON.parse(
          Buffer.from(req.query.cursor, "base64url").toString(),
        );
        if (
          !/^[a-f0-9]{24}$/.test(c.id) ||
          !Number.isFinite(Date.parse(c.time))
        )
          throw Error();
        const op = ascending ? "$gt" : "$lt";
        filter.$or = [
          { [field]: { [op]: new Date(c.time) } },
          { [field]: new Date(c.time), _id: { [op]: id(c.id) } },
        ];
      } catch {
        fail(400, "INVALID_CURSOR", "Invalid cursor.");
      }
    }
    return limit;
  };
  const page = (rows, limit, field) => {
    const more = rows.length > limit;
    rows.splice(limit);
    const last = rows.at(-1);
    return {
      limit,
      nextCursor: more
        ? Buffer.from(
            JSON.stringify({ id: String(last._id), time: last[field] }),
          ).toString("base64url")
        : null,
    };
  };
  patient.get("/schedules", scope("schedule.read"), async (req, res) => {
    const filter = { patientId: req.patient._id },
      limit = paginate(req, ["status"], filter);
    if (req.query.status) {
      if (!["active", "paused"].includes(req.query.status))
        fail(400, "INVALID_QUERY", "Use active or paused.");
      filter.status = req.query.status;
    }
    const rows = await db.list("Schedule", filter, limit + 1),
      meta = page(rows, limit, "createdAt");
    const result = [];
    for (const row of rows)
      result.push({
        ...publicDoc(row),
        currentVersion: publicDoc(await current(row)),
      });
    send(req, res, result, 200, meta);
  });
  patient.get(
    "/schedules/:scheduleId",
    scope("schedule.read"),
    async (req, res) => {
      if (Object.keys(req.query).length)
        fail(400, "INVALID_QUERY", "Unsupported query.");
      const row = await schedule(req);
      send(req, res, {
        schedule: publicDoc(row),
        version: publicDoc(await current(row)),
      });
    },
  );
  patient.get(
    "/schedules/:scheduleId/versions",
    scope("schedule.read"),
    async (req, res) => {
      const row = await schedule(req),
        filter = { patientId: row.patientId, scheduleId: row._id },
        limit = paginate(req, [], filter);
      const rows = await db.list("ScheduleVersion", filter, limit + 1),
        meta = page(rows, limit, "createdAt");
      send(req, res, rows.map(publicDoc), 200, meta);
    },
  );
  patient.get(
    "/schedules/:scheduleId/occurrences",
    scope("schedule.read"),
    async (req, res) => {
      const row = await schedule(req),
        filter = { patientId: row.patientId, scheduleId: row._id },
        limit = paginate(req, ["view"], filter, "dueAtUTC", true);
      if (req.query.view && !["upcoming", "history"].includes(req.query.view))
        fail(400, "INVALID_QUERY", "Use upcoming or history.");
      if (req.query.view !== "history") {
        filter.dueAtUTC = {
          $gte: now(),
          $lt: new Date(now().getTime() + 7 * 86400000),
        };
        filter.state = "pending";
      }
      const rows = await db.list(
          "DoseOccurrence",
          filter,
          limit + 1,
          undefined,
          { dueAtUTC: 1, _id: 1 },
        ),
        meta = page(rows, limit, "dueAtUTC");
      send(req, res, rows.map(publicDoc), 200, meta);
    },
  );
}
