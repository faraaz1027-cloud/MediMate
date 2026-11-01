import mongoose from "mongoose";

export function installPrescriptions(
  patient,
  { db, csrf, scope, mutate, fail, id, object, text, publicDoc, now },
) {
  const fields = [
    "medicineText",
    "instructionsText",
    "strengthText",
    "doseQuantity",
    "doseUnit",
    "frequencyText",
    "durationText",
    "clarificationRequired",
  ];
  const units = [
    "tablet",
    "capsule",
    "mL",
    "mg",
    "g",
    "drop",
    "puff",
    "unit",
    "application",
  ];
  const invalid = (path, message) =>
    fail(422, "VALIDATION_ERROR", "Correct the highlighted fields.", [
      { path, message },
    ]);
  const revision = (value) => {
    if (!Number.isInteger(value) || value < 0)
      invalid("expectedRevision", "Use the latest integer revision.");
  };
  function instructions(value) {
    if (!Array.isArray(value) || !value.length || value.length > 30)
      invalid("instructions", "Enter 1–30 instructions.");
    const used = new Set();
    return value.map((line, i) => {
      object(
        line,
        ["lineNumber", ...fields],
        [
          "lineNumber",
          "medicineText",
          "instructionsText",
          "clarificationRequired",
        ],
      );
      if (
        !Number.isInteger(line.lineNumber) ||
        line.lineNumber < 1 ||
        used.has(line.lineNumber)
      )
        invalid("instructions", "Line numbers must be positive and unique.");
      used.add(line.lineNumber);
      if (typeof line.clarificationRequired !== "boolean")
        invalid("clarificationRequired", "Review state is required.");
      const out = {
        lineNumber: line.lineNumber,
        medicineText: text(line.medicineText, `instructions.${i}.medicineText`),
        instructionsText: text(
          line.instructionsText,
          `instructions.${i}.instructionsText`,
          2000,
        ),
        clarificationRequired: line.clarificationRequired,
      };
      for (const key of ["strengthText", "frequencyText", "durationText"])
        if (line[key] !== undefined)
          out[key] = text(line[key], `instructions.${i}.${key}`);
      if (line.doseQuantity !== undefined) {
        if (
          typeof line.doseQuantity !== "string" ||
          !/^\d{1,12}(\.\d{1,6})?$/.test(line.doseQuantity) ||
          Number(line.doseQuantity) <= 0 ||
          !line.doseUnit
        )
          invalid(
            `instructions.${i}.doseQuantity`,
            "Enter a positive decimal dose quantity and unit.",
          );
        out.doseQuantity = line.doseQuantity;
        out.doseUnit = text(line.doseUnit, "doseUnit", 30);
      } else if (line.doseUnit !== undefined)
        invalid(
          `instructions.${i}.doseQuantity`,
          "Quantity is required with unit.",
        );
      return out;
    });
  }
  function provenance(value) {
    if (value === undefined) return undefined;
    object(
      value,
      [
        "fileName",
        "mimeType",
        "sizeBytes",
        "sha256",
        "ocrText",
        "confidence",
        "ocrStatus",
      ],
      ["fileName", "mimeType", "sizeBytes", "sha256", "ocrText", "ocrStatus"],
    );
    if (
      !["image/png", "image/jpeg"].includes(value.mimeType) ||
      !Number.isInteger(value.sizeBytes) ||
      value.sizeBytes < 1 ||
      value.sizeBytes > 5 * 1024 * 1024 ||
      typeof value.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(value.sha256) ||
      !["succeeded", "failed"].includes(value.ocrStatus)
    )
      invalid("source", "Invalid source image metadata.");
    if (
      typeof value.ocrText !== "string" ||
      value.ocrText.length > 30000 ||
      (value.confidence !== undefined &&
        (typeof value.confidence !== "number" ||
          !Number.isFinite(value.confidence) ||
          value.confidence < 0 ||
          value.confidence > 100))
    )
      invalid("source", "Invalid OCR suggestion metadata.");
    return { ...value, fileName: text(value.fileName, "fileName", 200) };
  }
  async function prescription(req, s, writable = false) {
    const p = await db.one(
      "Prescription",
      { _id: id(req.params.prescriptionId), patientId: req.patient._id },
      s,
    );
    if (!p) fail(404, "NOT_FOUND", "Record not found.");
    if (writable && p.status !== "active")
      fail(
        409,
        "INVALID_TRANSITION",
        "Archived prescriptions cannot be changed.",
      );
    return p;
  }
  async function version(req, versionId, s) {
    const v = await db.one(
      "PrescriptionVersion",
      {
        _id: id(String(versionId)),
        prescriptionId: id(req.params.prescriptionId),
        patientId: req.patient._id,
      },
      s,
    );
    if (!v) fail(404, "NOT_FOUND", "Version not found.");
    return v;
  }
  async function withLines(v, s) {
    if (!v) return null;
    const lines = await db.list(
      "PrescriptionInstruction",
      { patientId: v.patientId, prescriptionVersionId: v._id },
      31,
      s,
    );
    return {
      ...publicDoc(v),
      instructions: lines
        .sort((a, b) => a.lineNumber - b.lineNumber)
        .map(publicDoc),
    };
  }
  async function writeLines(req, versionId, lines, s) {
    for (const line of lines)
      await db.insert(
        "PrescriptionInstruction",
        {
          ...line,
          patientId: req.patient._id,
          prescriptionVersionId: versionId,
        },
        s,
      );
  }
  async function parentUpdate(p, set, s) {
    const updated = await db.update(
      "Prescription",
      { _id: p._id, patientId: p.patientId, revision: p.revision },
      set,
      s,
    );
    if (!updated)
      fail(409, "REVISION_CONFLICT", "Reload the prescription and retry.");
    return updated;
  }
  patient.post(
    "/prescriptions",
    csrf,
    scope("prescription.write"),
    async (req, res) => {
      const b = object(
        req.body,
        ["title", "instructions", "source"],
        ["instructions"],
      );
      const lines = instructions(b.instructions),
        source = provenance(b.source),
        title = b.title === undefined ? undefined : text(b.title, "title");
      await mutate(req, res, "prescription.write", async (s) => {
        const prescriptionId = new mongoose.Types.ObjectId(),
          versionId = new mongoose.Types.ObjectId();
        const p = await db.insert(
          "Prescription",
          {
            _id: prescriptionId,
            patientId: req.patient._id,
            title,
            status: "active",
            draftVersionId: versionId,
          },
          s,
        );
        const v = await db.insert(
          "PrescriptionVersion",
          {
            _id: versionId,
            patientId: req.patient._id,
            prescriptionId,
            versionNumber: 1,
            status: "draft",
            ...(source ? { source } : {}),
          },
          s,
        );
        await writeLines(req, versionId, lines, s);
        return {
          prescription: publicDoc(p),
          draftVersion: await withLines(v, s),
        };
      });
    },
  );
  patient.get(
    "/prescriptions/:prescriptionId",
    scope("prescription.read"),
    async (req, res) => {
      const p = await prescription(req);
      res.json({
        data: {
          prescription: publicDoc(p),
          currentVersion: p.currentVersionId
            ? await withLines(await version(req, p.currentVersionId))
            : null,
          draftVersion: p.draftVersionId
            ? await withLines(await version(req, p.draftVersionId))
            : null,
        },
        meta: { requestId: req.requestId },
      });
    },
  );
  patient.post(
    "/prescriptions/:prescriptionId/versions",
    csrf,
    scope("prescription.write"),
    async (req, res) => {
      const b = object(
        req.body,
        ["expectedRevision", "previousVersionId", "instructions", "source"],
        ["expectedRevision", "previousVersionId", "instructions"],
      );
      revision(b.expectedRevision);
      const previousId = id(b.previousVersionId),
        lines = instructions(b.instructions),
        source = provenance(b.source);
      await mutate(req, res, "prescription.write", async (s) => {
        const p = await prescription(req, s, true);
        if (p.revision !== b.expectedRevision)
          fail(409, "REVISION_CONFLICT", "Reload the prescription and retry.");
        await version(req, previousId, s);
        if (
          !p.currentVersionId ||
          String(p.currentVersionId) !== String(previousId) ||
          p.draftVersionId
        )
          fail(
            409,
            "INVALID_TRANSITION",
            "Replace the current confirmed version; finish the existing draft first.",
          );
        const previous = await version(req, previousId, s);
        const v = await db.insert(
          "PrescriptionVersion",
          {
            patientId: req.patient._id,
            prescriptionId: p._id,
            previousVersionId: previousId,
            versionNumber: previous.versionNumber + 1,
            status: "draft",
            ...(source ? { source } : {}),
          },
          s,
        );
        const updated = await parentUpdate(p, { draftVersionId: v._id }, s);
        await writeLines(req, v._id, lines, s);
        return {
          prescription: publicDoc(updated),
          draftVersion: await withLines(v, s),
        };
      });
    },
  );
  patient.patch(
    "/prescriptions/:prescriptionId/versions/:versionId",
    csrf,
    scope("prescription.write"),
    async (req, res) => {
      const b = object(
        req.body,
        ["expectedRevision", "instructions", "reviewCorrections", "source"],
        ["expectedRevision", "instructions"],
      );
      revision(b.expectedRevision);
      const lines = instructions(b.instructions),
        source = provenance(b.source);
      if (
        b.reviewCorrections !== undefined &&
        (typeof b.reviewCorrections !== "string" ||
          b.reviewCorrections.length > 5000)
      )
        invalid("reviewCorrections", "Use at most 5000 characters.");
      const corrections = b.reviewCorrections?.trim();
      await mutate(
        req,
        res,
        "prescription.write",
        async (s) => {
          const p = await prescription(req, s, true),
            v = await version(req, req.params.versionId, s);
          if (
            v.status !== "draft" ||
            String(p.draftVersionId) !== String(v._id)
          )
            fail(
              409,
              "INVALID_TRANSITION",
              "Confirmed history is immutable. Create a replacement draft.",
            );
          const updated = await db.update(
            "PrescriptionVersion",
            { _id: v._id, status: "draft", revision: b.expectedRevision },
            {
              ...(source ? { source } : {}),
              ...(corrections !== undefined
                ? { reviewCorrections: corrections }
                : {}),
            },
            s,
          );
          if (!updated)
            fail(409, "REVISION_CONFLICT", "Reload the draft and retry.");
          const parent = await parentUpdate(p, { draftVersionId: v._id }, s);
          await db.remove(
            "PrescriptionInstruction",
            { patientId: req.patient._id, prescriptionVersionId: v._id },
            s,
          );
          await writeLines(req, v._id, lines, s);
          return {
            prescription: publicDoc(parent),
            draftVersion: await withLines(updated, s),
          };
        },
        200,
      );
    },
  );
  patient.post(
    "/prescriptions/:prescriptionId/versions/:versionId/confirm",
    csrf,
    scope("prescription.confirm"),
    async (req, res) => {
      const b = object(
        req.body,
        ["expectedRevision", "reviewed"],
        ["expectedRevision", "reviewed"],
      );
      revision(b.expectedRevision);
      if (b.reviewed !== true)
        invalid("reviewed", "Explicit human review is required.");
      await mutate(
        req,
        res,
        "prescription.confirm",
        async (s) => {
          const p = await prescription(req, s, true),
            v = await version(req, req.params.versionId, s),
            full = await withLines(v, s);
          if (
            v.status !== "draft" ||
            String(p.draftVersionId) !== String(v._id)
          )
            fail(
              409,
              "INVALID_TRANSITION",
              "Only the current draft can be confirmed.",
            );
          if (!full.instructions.length)
            invalid(
              "instructions",
              "At least one reviewed instruction is required.",
            );
          for (const [i, line] of full.instructions.entries()) {
            if (line.clarificationRequired)
              invalid(
                `instructions.${i}.clarificationRequired`,
                "Resolve every clarification before confirmation.",
              );
            if (!line.doseQuantity || Number(line.doseQuantity) <= 0)
              invalid(
                `instructions.${i}.doseQuantity`,
                "Every line requires a positive quantity.",
              );
            if (!units.includes(line.doseUnit))
              invalid(
                `instructions.${i}.doseUnit`,
                "Select a supported dose unit.",
              );
            for (const field of ["frequencyText", "durationText"])
              if (!line[field]?.trim())
                invalid(
                  `instructions.${i}.${field}`,
                  "Reviewed timing and duration are required on every line.",
                );
          }
          const confirmed = await db.update(
            "PrescriptionVersion",
            { _id: v._id, revision: b.expectedRevision, status: "draft" },
            {
              status: "confirmed",
              confirmedAt: now(),
              confirmedByUserId: req.actorId,
            },
            s,
          );
          if (!confirmed)
            fail(409, "REVISION_CONFLICT", "Reload the draft and retry.");
          const parent = await parentUpdate(
            p,
            { currentVersionId: v._id, draftVersionId: null },
            s,
          );
          return {
            prescription: publicDoc(parent),
            currentVersion: await withLines(confirmed, s),
          };
        },
        200,
      );
    },
  );
  patient.get(
    "/prescriptions/:prescriptionId/versions",
    scope("prescription.read"),
    async (req, res) => {
      await prescription(req);
      if (
        Object.keys(req.query).some((k) => !["limit", "cursor"].includes(k)) ||
        Object.values(req.query).some((v) => typeof v !== "string")
      )
        fail(400, "INVALID_QUERY", "Unsupported query.");
      const limit =
        req.query.limit === undefined ? 20 : Number(req.query.limit);
      if (!Number.isInteger(limit) || limit < 1 || limit > 100)
        fail(400, "INVALID_QUERY", "Limit must be 1–100.");
      const filter = {
        patientId: req.patient._id,
        prescriptionId: id(req.params.prescriptionId),
      };
      if (req.query.cursor) {
        try {
          const c = JSON.parse(
            Buffer.from(req.query.cursor, "base64url").toString(),
          );
          const cursorId = id(c.id),
            date = new Date(c.createdAt);
          if (!Number.isFinite(date.getTime())) throw Error();
          filter.$or = [
            { createdAt: { $lt: date } },
            { createdAt: date, _id: { $lt: cursorId } },
          ];
        } catch {
          fail(400, "INVALID_CURSOR", "Invalid pagination cursor.");
        }
      }
      const rows = await db.list("PrescriptionVersion", filter, limit + 1),
        more = rows.length > limit;
      rows.splice(limit);
      const last = rows.at(-1);
      res.json({
        data: await Promise.all(rows.map((v) => withLines(v))),
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
    },
  );
  patient.get(
    "/prescriptions/:prescriptionId/comparison",
    scope("prescription.read"),
    async (req, res) => {
      await prescription(req);
      if (
        Object.keys(req.query).some(
          (k) => !["fromVersionId", "toVersionId"].includes(k),
        )
      )
        fail(400, "INVALID_QUERY", "Unsupported query.");
      const a = await withLines(
          await version(req, id(req.query.fromVersionId)),
        ),
        b = await withLines(await version(req, id(req.query.toVersionId)));
      const before = new Map(a.instructions.map((x) => [x.lineNumber, x])),
        after = new Map(b.instructions.map((x) => [x.lineNumber, x]));
      const added = b.instructions.filter((x) => !before.has(x.lineNumber)),
        removed = a.instructions.filter((x) => !after.has(x.lineNumber)),
        changed = [];
      for (const [lineNumber, line] of before)
        if (after.has(lineNumber)) {
          const differences = fields
            .filter((k) => line[k] !== after.get(lineNumber)[k])
            .map((field) => ({
              field,
              before: line[field] ?? null,
              after: after.get(lineNumber)[field] ?? null,
            }));
          if (differences.length)
            changed.push({ lineNumber, fields: differences });
        }
      res.json({
        data: { added, removed, changed },
        meta: { requestId: req.requestId },
      });
    },
  );
  patient.post(
    "/prescriptions/:prescriptionId/archive",
    csrf,
    scope("prescription.write"),
    async (req, res) => {
      const b = object(req.body, ["expectedRevision"], ["expectedRevision"]);
      revision(b.expectedRevision);
      await mutate(
        req,
        res,
        "prescription.write",
        async (s) => {
          const p = await prescription(req, s, true);
          if (p.revision !== b.expectedRevision)
            fail(
              409,
              "REVISION_CONFLICT",
              "Reload the prescription and retry.",
            );
          return publicDoc(await parentUpdate(p, { status: "archived" }, s));
        },
        200,
      );
    },
  );
}
