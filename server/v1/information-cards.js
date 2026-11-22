import { OpenFDAError, labelIdValid } from "./openfda.js";

export function installInformationCards(
  patient,
  { db, csrf, scope, mutate, fail, id, object, publicDoc, now, send, openfda },
) {
  const invalid = (path, message) =>
    fail(422, "VALIDATION_ERROR", "Correct the highlighted fields.", [
      { path, message },
    ]);
  const revision = (x, path = "expectedRevision", nullable = false) => {
    if (!(nullable && x === null) && (!Number.isInteger(x) || x < 0))
      invalid(
        path,
        "Reload and use the current revision (null for a new card).",
      );
  };
  const query = (req, keys = []) => {
    if (
      Object.keys(req.query).some((k) => !keys.includes(k)) ||
      Object.values(req.query).some((x) => typeof x !== "string")
    )
      fail(400, "INVALID_QUERY", "Unsupported query.");
  };
  async function item(req, session, writable = false) {
    const row = await db.one(
      "CabinetItem",
      { _id: id(req.params.itemId), patientId: req.patient._id },
      session,
    );
    if (!row) fail(404, "NOT_FOUND", "Medicine not found.");
    if (writable && row.status !== "active")
      fail(409, "INVALID_STATE", "Archived medicines are read-only.");
    return row;
  }
  async function identity(row, s) {
    if (row.entryType !== "external") return null;
    const source = await db.one(
      "SourceRecord",
      { _id: row.sourceRecordId, provider: "rxnorm", matchStatus: "selected" },
      s,
    );
    return source && /^\d{1,12}$/.test(source.externalId)
      ? source.externalId
      : null;
  }
  async function upstream(fn) {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof OpenFDAError) fail(e.status, e.code, e.message);
      throw e;
    }
  }
  const snapshot = (row, rxcui) => ({
    cabinetItemId: String(row._id),
    displayName: row.displayName,
    strengthText: row.strengthText || "",
    form: row.form || "",
    revision: row.revision,
    rxcui,
  });
  const cardFilter = (req) => ({
    patientId: req.patient._id,
    cabinetItemId: id(req.params.itemId),
  });
  async function projection(card, row, s) {
    if (!card)
      return {
        availability: "unavailable",
        reason: "not_selected",
        revision: null,
        personalNote: "",
        selectedPassages: [],
        evidenceRefs: [],
        source: null,
        itemChanged: false,
      };
    const source =
      card.sourceRecordId &&
      (await db.one(
        "SourceRecord",
        { _id: card.sourceRecordId, provider: "openfda" },
        s,
      ));
    if (card.availability === "available" && !source)
      fail(
        503,
        "SOURCE_RECORD_UNAVAILABLE",
        "The saved source record is unavailable. Reload or contact the project owner; uncited passages are hidden.",
      );
    const out = publicDoc(card);
    return {
      ...out,
      itemChanged: card.itemSnapshot?.revision !== row.revision,
      source: source ? publicDoc(source) : null,
      evidenceRefs: card.selectedPassages.map((p) => ({
        sourceRecordId: String(card.sourceRecordId),
        passageKey: p.key,
        index: p.index,
        text: p.text,
      })),
    };
  }
  patient.get(
    "/cabinet-items/:itemId/label-candidates",
    scope("cabinet.read"),
    async (req, res) => {
      query(req, ["cursor", "refresh"]);
      if (req.query.refresh !== undefined && req.query.refresh !== "true")
        fail(400, "INVALID_QUERY", "Use refresh=true or omit it.");
      const row = await item(req, undefined, true),
        rxcui = await identity(row);
      let offset = 0;
      if (req.query.cursor) {
        try {
          const c = JSON.parse(
            Buffer.from(req.query.cursor, "base64url").toString(),
          );
          if (
            c.rxcui !== rxcui ||
            c.revision !== row.revision ||
            !Number.isInteger(c.offset) ||
            c.offset < 5 ||
            c.offset > 100 ||
            c.offset % 5
          )
            throw Error();
          offset = c.offset;
        } catch {
          fail(
            400,
            "INVALID_CURSOR",
            "Reload label candidates after the medicine changes.",
          );
        }
      }
      if (!rxcui)
        return send(
          req,
          res,
          {
            availability: "unavailable",
            reason: "unverified_identity",
            itemRevision: row.revision,
            candidates: [],
          },
          200,
          { nextCursor: null },
        );
      const result = await upstream(() =>
        openfda.search(rxcui, offset, req.query.refresh === "true"),
      );
      send(
        req,
        res,
        {
          availability: result.candidates.length ? "candidates" : "unavailable",
          reason: result.candidates.length ? null : "no_matching_label",
          itemRevision: row.revision,
          rxcui,
          ...result,
        },
        200,
        {
          nextCursor:
            result.nextOffset === null
              ? null
              : Buffer.from(
                  JSON.stringify({
                    rxcui,
                    revision: row.revision,
                    offset: result.nextOffset,
                  }),
                ).toString("base64url"),
        },
      );
    },
  );
  patient.get(
    "/cabinet-items/:itemId/information-card",
    scope("cabinet.read"),
    async (req, res) => {
      query(req);
      const row = await item(req);
      send(
        req,
        res,
        await projection(await db.one("MedicineCard", cardFilter(req)), row),
      );
    },
  );
  patient.put(
    "/cabinet-items/:itemId/information-card",
    csrf,
    scope("cabinet.write"),
    async (req, res) => {
      const b = object(
        req.body,
        [
          "selectedLabelId",
          "expectedRevision",
          "expectedCabinetRevision",
          "applicabilityConfirmed",
          "expectedContentHash",
        ],
        ["selectedLabelId", "expectedRevision", "expectedCabinetRevision"],
      );
      revision(b.expectedRevision, "expectedRevision", true);
      revision(b.expectedCabinetRevision, "expectedCabinetRevision");
      if (b.selectedLabelId !== null && !labelIdValid(b.selectedLabelId))
        invalid("selectedLabelId", "Choose a valid label record.");
      if (b.selectedLabelId !== null && b.applicabilityConfirmed !== true)
        invalid(
          "applicabilityConfirmed",
          "Review the actual product, ingredient, strength, form and passages before selecting.",
        );
      if (
        b.selectedLabelId !== null &&
        (typeof b.expectedContentHash !== "string" ||
          !/^[a-f0-9]{64}$/.test(b.expectedContentHash))
      )
        invalid(
          "expectedContentHash",
          "Review a candidate before selecting it.",
        );
      let selected, preparedRxcui;
      await mutate(
        req,
        res,
        "cabinet.write",
        async (s) => {
          // If an operation receipt expires between the outer replay check and
          // transaction, never treat a missing prepared selection as removal.
          if (b.selectedLabelId !== null && !selected)
            fail(
              409,
              "SOURCE_CHANGED",
              "Selection context expired. Retry after reviewing the candidate again.",
            );
          const row = await item(req, s, true),
            rxcui = await identity(row, s);
          if (
            row.revision !== b.expectedCabinetRevision ||
            (selected && rxcui !== preparedRxcui)
          )
            fail(
              409,
              "SOURCE_CHANGED",
              "Medicine changed. Reload and review the match again.",
            );
          await db.fence("CabinetItem", { _id: row._id }, s);
          const old = await db.one("MedicineCard", cardFilter(req), s);
          if ((old?.revision ?? null) !== b.expectedRevision)
            fail(
              409,
              "REVISION_CONFLICT",
              "Reload the saved card before replacing it.",
            );
          let source;
          if (selected)
            source = await db.insert(
              "SourceRecord",
              {
                provider: "openfda",
                externalId: selected.labelId,
                sourceUrl: selected.sourceUrl,
                sourceVersion: selected.version,
                retrievedAt: selected.retrievedAt,
                contentHash: selected.contentHash,
                snapshot: selected,
                matchStatus: "selected",
              },
              s,
            );
          const values = {
            availability: selected ? "available" : "unavailable",
            reason: selected ? "" : "not_selected",
            sourceRecordId: source?._id || null,
            selectedPassages: selected?.passages || [],
            itemSnapshot: snapshot(row, rxcui),
            applicabilityConfirmedBy: selected ? req.actorId : null,
            applicabilityConfirmedAt: selected ? now() : null,
            revisedAt: now(),
          };
          const card = old
            ? await db.update(
                "MedicineCard",
                { _id: old._id, revision: b.expectedRevision },
                values,
                s,
              )
            : await db.insert(
                "MedicineCard",
                { ...cardFilter(req), ...values, personalNote: "" },
                s,
              );
          if (!card) fail(409, "REVISION_CONFLICT", "Reload the saved card.");
          return projection(card, row, s);
        },
        200,
        b.selectedLabelId === null
          ? undefined
          : async () => {
              const row = await item(req, undefined, true);
              preparedRxcui = await identity(row);
              if (!preparedRxcui)
                invalid(
                  "selectedLabelId",
                  "An exact saved RxNorm product identity is required; no name-only match is accepted.",
                );
              if (row.revision !== b.expectedCabinetRevision)
                fail(409, "SOURCE_CHANGED", "Medicine changed. Reload first.");
              selected = await upstream(() =>
                openfda.resolve(b.selectedLabelId, preparedRxcui),
              );
              if (!selected)
                invalid(
                  "selectedLabelId",
                  "This label lacks an exact RxNorm match or usable source passages. Choose another candidate.",
                );
              if (selected.contentHash !== b.expectedContentHash)
                fail(
                  409,
                  "SOURCE_CHANGED",
                  "Label content changed. Refresh candidates and review the new passages.",
                );
            },
      );
    },
  );
  patient.patch(
    "/cabinet-items/:itemId/information-card/note",
    csrf,
    scope("cabinet.write"),
    async (req, res) => {
      const b = object(
        req.body,
        ["expectedRevision", "personalNote"],
        ["expectedRevision", "personalNote"],
      );
      revision(b.expectedRevision, "expectedRevision", true);
      if (typeof b.personalNote !== "string" || b.personalNote.length > 2000)
        invalid(
          "personalNote",
          "Enter at most 2000 characters, or clear the note.",
        );
      await mutate(
        req,
        res,
        "cabinet.write",
        async (s) => {
          const row = await item(req, s, true);
          await db.fence("CabinetItem", { _id: row._id }, s);
          const old = await db.one("MedicineCard", cardFilter(req), s);
          if ((old?.revision ?? null) !== b.expectedRevision)
            fail(
              409,
              "REVISION_CONFLICT",
              "Reload the card before changing its note.",
            );
          const values = { personalNote: b.personalNote, revisedAt: now() };
          const card = old
            ? await db.update(
                "MedicineCard",
                { _id: old._id, revision: b.expectedRevision },
                values,
                s,
              )
            : await db.insert(
                "MedicineCard",
                {
                  ...cardFilter(req),
                  ...values,
                  availability: "unavailable",
                  reason: "not_selected",
                  selectedPassages: [],
                  itemSnapshot: snapshot(row, await identity(row, s)),
                },
                s,
              );
          if (!card) fail(409, "REVISION_CONFLICT", "Reload the card.");
          return projection(card, row, s);
        },
        200,
      );
    },
  );
}
