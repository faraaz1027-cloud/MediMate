import { createHash } from "node:crypto";
import { RxNormError } from "./rxnorm.js";

export function installCabinet(
  patient,
  { db, csrf, scope, mutate, fail, id, object, text, publicDoc, rxnorm },
) {
  const invalid = (path, message) =>
    fail(422, "VALIDATION_ERROR", "Correct the highlighted fields.", [
      { path, message },
    ]);
  const revision = (value) => {
    if (!Number.isInteger(value) || value < 0)
      invalid("expectedRevision", "Use the latest integer revision.");
  };
  const externalId = (value) => {
    if (typeof value !== "string" || !/^\d{1,12}$/.test(value))
      invalid("externalId", "Choose a valid RxNorm result.");
    return value;
  };
  async function upstream(fn) {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof RxNormError) fail(e.status, e.code, e.message);
      throw e;
    }
  }
  function query(req, keys) {
    if (
      Object.keys(req.query).some((k) => !keys.includes(k)) ||
      Object.values(req.query).some((v) => typeof v !== "string")
    )
      fail(400, "INVALID_QUERY", "Unsupported query.");
  }
  function page(req, filter) {
    const limit = req.query.limit === undefined ? 20 : Number(req.query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      fail(400, "INVALID_QUERY", "Limit must be 1–100.");
    if (req.query.cursor) {
      try {
        const c = JSON.parse(
            Buffer.from(req.query.cursor, "base64url").toString(),
          ),
          date = new Date(c.createdAt),
          cursorId = id(c.id);
        if (!Number.isFinite(date.getTime())) throw Error();
        filter.$or = [
          { createdAt: { $lt: date } },
          { createdAt: date, _id: { $lt: cursorId } },
        ];
      } catch {
        fail(400, "INVALID_CURSOR", "Invalid pagination cursor.");
      }
    }
    return limit;
  }
  function result(req, res, rows, limit, extra = {}) {
    const more = rows.length > limit;
    rows.splice(limit);
    const last = rows.at(-1);
    res.json({
      data: rows.map(publicDoc),
      meta: {
        requestId: req.requestId,
        limit,
        ...extra,
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
  async function item(req, s, writable = false) {
    const row = await db.one(
      "CabinetItem",
      { _id: id(req.params.itemId), patientId: req.patient._id },
      s,
    );
    if (!row) fail(404, "NOT_FOUND", "Record not found.");
    if (writable && row.status !== "active")
      fail(
        409,
        "INVALID_TRANSITION",
        "Archived cabinet items cannot be changed.",
      );
    return row;
  }
  async function snapshot(req, row, reason, s, legacy = false) {
    return db.insert(
      "CabinetRevision",
      {
        patientId: req.patient._id,
        cabinetItemId: row._id,
        revisionNumber: row.revision,
        actorUserId: legacy ? null : req.actorId,
        snapshot: publicDoc(row),
        reason,
        legacyBaseline: legacy,
      },
      s,
    );
  }
  patient.get("/medicine-search", scope("cabinet.read"), async (req, res) => {
    query(req, ["q", "cursor", "limit"]);
    if (
      typeof req.query.q !== "string" ||
      req.query.q.trim().length < 2 ||
      req.query.q.trim().length > 100
    )
      fail(400, "INVALID_QUERY", "Enter a medicine query of 2–100 characters.");
    const q = req.query.q.trim(),
      limit = req.query.limit === undefined ? 20 : Number(req.query.limit);
    let offset = 0;
    if (!Number.isInteger(limit) || limit < 1 || limit > 50)
      fail(400, "INVALID_QUERY", "Search limit must be 1–50.");
    if (req.query.cursor) {
      try {
        const c = JSON.parse(
          Buffer.from(req.query.cursor, "base64url").toString(),
        );
        if (
          c.q !== q ||
          !Number.isInteger(c.offset) ||
          c.offset < 0 ||
          c.offset > 100000
        )
          throw Error();
        offset = c.offset;
      } catch {
        fail(400, "INVALID_CURSOR", "Search cursor does not match this query.");
      }
    }
    const r = await upstream(() => rxnorm.search(q)),
      total = r.candidates.length;
    res.json({
      data: { ...r, candidates: r.candidates.slice(offset, offset + limit) },
      meta: {
        requestId: req.requestId,
        total,
        limit,
        nextCursor:
          offset + limit < total
            ? Buffer.from(
                JSON.stringify({ q, offset: offset + limit }),
              ).toString("base64url")
            : null,
      },
    });
  });
  patient.get(
    "/medicine-search/:externalId",
    scope("cabinet.read"),
    async (req, res) => {
      query(req, []);
      const candidate = await upstream(() =>
        rxnorm.resolve(externalId(req.params.externalId)),
      );
      res.json({ data: candidate, meta: { requestId: req.requestId } });
    },
  );
  patient.get("/cabinet-items", scope("cabinet.read"), async (req, res) => {
    query(req, ["q", "entryType", "status", "cursor", "limit"]);
    const filter = { patientId: req.patient._id };
    if (req.query.status !== "all") {
      if (
        req.query.status &&
        !["active", "archived"].includes(req.query.status)
      )
        fail(400, "INVALID_QUERY", "Unknown status.");
      filter.status = req.query.status || "active";
    }
    if (req.query.entryType) {
      if (!["manual", "external"].includes(req.query.entryType))
        fail(400, "INVALID_QUERY", "Unknown entry type.");
      filter.entryType = req.query.entryType;
    }
    if (req.query.q !== undefined) {
      if (req.query.q.length > 100)
        fail(400, "INVALID_QUERY", "Filter is too long.");
      filter.displayName = {
        $regex: req.query.q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        $options: "i",
      };
    }
    const limit = page(req, filter);
    result(req, res, await db.list("CabinetItem", filter, limit + 1), limit);
  });
  patient.get(
    "/cabinet-items/:itemId",
    scope("cabinet.read"),
    async (req, res) => {
      query(req, []);
      const row = await item(req),
        source = row.sourceRecordId
          ? await db.one("SourceRecord", { _id: row.sourceRecordId })
          : null;
      res.json({
        data: { ...publicDoc(row), source: source ? publicDoc(source) : null },
        meta: { requestId: req.requestId },
      });
    },
  );
  patient.post(
    "/cabinet-items",
    csrf,
    scope("cabinet.write"),
    async (req, res) => {
      const b = object(
        req.body,
        [
          "displayName",
          "entryType",
          "strengthText",
          "form",
          "externalId",
          "reviewed",
        ],
        ["entryType"],
      );
      if (!["manual", "external"].includes(b.entryType))
        invalid("entryType", "Choose manual or external.");
      const fields = { entryType: b.entryType, status: "active" };
      for (const k of ["strengthText", "form"])
        if (b[k] !== undefined) fields[k] = text(b[k], k);
      let selected, prepare;
      if (b.entryType === "manual") {
        if (b.externalId !== undefined || b.reviewed !== undefined)
          invalid(
            "entryType",
            "Manual entries cannot claim an external identity.",
          );
        fields.displayName = text(b.displayName, "displayName", 500);
      } else {
        externalId(b.externalId);
        if (b.displayName !== undefined)
          invalid("displayName", "External names are read from RxNorm.");
        if (b.reviewed !== true)
          invalid(
            "reviewed",
            "Review the selected name, strength and form first.",
          );
        prepare = async () => {
          selected = await upstream(() => rxnorm.resolve(b.externalId));
        };
      }
      await mutate(
        req,
        res,
        "cabinet.write",
        async (s) => {
          if (selected) {
            const source = await db.insert(
              "SourceRecord",
              {
                provider: "rxnorm",
                externalId: selected.externalId,
                sourceUrl: selected.sourceUrl,
                retrievedAt: new Date(selected.retrievedAt),
                contentHash: createHash("sha256")
                  .update(JSON.stringify(selected))
                  .digest("hex"),
                snapshot: selected,
                matchStatus: "selected",
              },
              s,
            );
            fields.displayName = selected.displayName;
            fields.sourceRecordId = source._id;
          }
          const row = await db.insert(
            "CabinetItem",
            { ...fields, patientId: req.patient._id },
            s,
          );
          await snapshot(req, row, "Created", s);
          return publicDoc(row);
        },
        201,
        prepare,
      );
    },
  );
  patient.patch(
    "/cabinet-items/:itemId",
    csrf,
    scope("cabinet.write"),
    async (req, res) => {
      const b = object(
        req.body,
        ["expectedRevision", "displayName", "strengthText", "form", "reason"],
        ["expectedRevision", "reason"],
      );
      revision(b.expectedRevision);
      const reason = text(b.reason, "reason", 500),
        set = {};
      if (
        !["displayName", "strengthText", "form"].some((k) => b[k] !== undefined)
      )
        invalid("displayName", "Change at least one field.");
      for (const k of ["displayName", "strengthText", "form"])
        if (b[k] !== undefined)
          set[k] =
            k !== "displayName" && b[k] === ""
              ? ""
              : text(b[k], k, k === "displayName" ? 500 : 200);
      await mutate(
        req,
        res,
        "cabinet.write",
        async (s) => {
          const old = await item(req, s, true);
          if (
            old.entryType === "external" &&
            b.displayName !== undefined &&
            b.displayName !== old.displayName
          )
            invalid(
              "displayName",
              "The RxNorm identity is fixed. Archive and create a different entry to change identity.",
            );
          if (old.revision !== b.expectedRevision)
            fail(409, "REVISION_CONFLICT", "Reload the item and retry.");
          if (
            !(await db.one(
              "CabinetRevision",
              { cabinetItemId: old._id, revisionNumber: old.revision },
              s,
            ))
          )
            await snapshot(
              req,
              old,
              "Baseline of item created before Step 22",
              s,
              true,
            );
          const row = await db.update(
            "CabinetItem",
            {
              _id: old._id,
              patientId: req.patient._id,
              revision: b.expectedRevision,
            },
            set,
            s,
          );
          if (!row)
            fail(409, "REVISION_CONFLICT", "Reload the item and retry.");
          await snapshot(req, row, reason, s);
          return publicDoc(row);
        },
        200,
      );
    },
  );
  patient.post(
    "/cabinet-items/:itemId/archive",
    csrf,
    scope("cabinet.write"),
    async (req, res) => {
      const b = object(req.body, ["expectedRevision"], ["expectedRevision"]);
      revision(b.expectedRevision);
      await mutate(
        req,
        res,
        "cabinet.write",
        async (s) => {
          const old = await item(req, s, true);
          if (old.revision !== b.expectedRevision)
            fail(409, "REVISION_CONFLICT", "Reload the item and retry.");
          if (
            !(await db.one(
              "CabinetRevision",
              { cabinetItemId: old._id, revisionNumber: old.revision },
              s,
            ))
          )
            await snapshot(
              req,
              old,
              "Baseline of item created before Step 22",
              s,
              true,
            );
          const row = await db.update(
            "CabinetItem",
            {
              _id: old._id,
              patientId: req.patient._id,
              revision: b.expectedRevision,
            },
            { status: "archived" },
            s,
          );
          if (!row)
            fail(409, "REVISION_CONFLICT", "Reload the item and retry.");
          await snapshot(req, row, "Archived", s);
          return publicDoc(row);
        },
        200,
      );
    },
  );
  patient.get(
    "/cabinet-items/:itemId/revisions",
    scope("cabinet.read"),
    async (req, res) => {
      query(req, ["cursor", "limit"]);
      await item(req);
      const filter = {
          patientId: req.patient._id,
          cabinetItemId: id(req.params.itemId),
        },
        limit = page(req, filter);
      result(
        req,
        res,
        await db.list("CabinetRevision", filter, limit + 1),
        limit,
      );
    },
  );
}
