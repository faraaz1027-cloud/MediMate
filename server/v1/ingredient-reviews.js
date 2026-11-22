import { createHash } from "node:crypto";
import { RxNormError } from "./rxnorm.js";

export function installIngredientReviews(patient, { db, csrf, scope, mutate, fail, id, object, publicDoc, now, send, rxnorm }) {
  const sourceRef = row => ({ id: String(row._id), provider: row.provider, externalId: row.externalId, sourceUrl: row.sourceUrl, retrievedAt: row.retrievedAt, contentHash: row.contentHash, sourceVersion: row.sourceVersion });
  const invalid = message => fail(422, "VALIDATION_ERROR", message);
  const conflict = () => fail(409, "REVISION_CONFLICT", "The medicine or confirmation changed. Reload and review again.");
  const filter = req => ({ patientId: req.patient._id, cabinetItemId: id(req.params.itemId) });
  async function item(req, s) {
    const row = await db.one("CabinetItem", { _id: id(req.params.itemId), patientId: req.patient._id }, s);
    if (!row) fail(404, "NOT_FOUND", "Medicine not found.");
    return row;
  }
  async function product(row, s) {
    if (row.entryType !== "external" || !row.sourceRecordId) return null;
    const src = await db.one("SourceRecord", { _id: row.sourceRecordId, provider: "rxnorm", matchStatus: "selected" }, s);
    return src?.externalId || null;
  }
  async function candidate(req) {
    const row = await item(req), productId = await product(row);
    if (row.status !== "active" || !productId) fail(422, "INGREDIENTS_UNAVAILABLE", "Select an active medicine with a reviewed RxNorm product identity.");
    let resolved, evidence;
    try { resolved = await rxnorm.resolve(productId); evidence = await rxnorm.ingredients(productId); }
    catch (e) { if (e instanceof RxNormError) fail(e.status, e.code, e.message); throw e; }
    if (!evidence.ingredients.length) fail(422, "INGREDIENTS_UNAVAILABLE", "The source has no confirmed ingredient identities for this product.");
    const contentHash = createHash("sha256").update(JSON.stringify({ productId, ingredients: evidence.ingredients, productName: resolved.displayName })).digest("hex");
    const saved = await db.one("IngredientConfirmation", filter(req));
    return { cabinetItem: publicDoc(row), product: resolved, ...evidence, contentHash, confirmationRevision: saved?.revision ?? null };
  }
  patient.get("/cabinet-items/:itemId/ingredient-candidates", scope("cabinet.read"), async (req,res) => send(req,res,await candidate(req)));
  patient.get("/cabinet-items/:itemId/ingredient-confirmation", scope("cabinet.read"), async (req,res) => {
    const row = await item(req), saved = await db.one("IngredientConfirmation", filter(req));
    send(req,res,{ confirmation: saved ? publicDoc(saved) : null, itemChanged: !!saved && saved.cabinetRevision !== row.revision });
  });
  patient.put("/cabinet-items/:itemId/ingredient-confirmation", csrf, scope("cabinet.write"), async (req,res) => {
    object(req.body,["expectedRevision","expectedCabinetRevision","expectedContentHash","reviewed"],["expectedRevision","expectedCabinetRevision","expectedContentHash","reviewed"]);
    const b = req.body;
    if (b.reviewed !== true || !Number.isInteger(b.expectedCabinetRevision) || b.expectedCabinetRevision < 0 || !(b.expectedRevision === null || Number.isInteger(b.expectedRevision) && b.expectedRevision >= 0) || !/^[a-f0-9]{64}$/.test(b.expectedContentHash)) invalid("Review the product, strength, form and complete ingredient list before confirming.");
    let selected;
    await mutate(req,res,"cabinet.write",async s => {
      const row = await item(req,s), old = await db.one("IngredientConfirmation",filter(req),s);
      if (row.status !== "active" || row.revision !== b.expectedCabinetRevision || (old?.revision ?? null) !== b.expectedRevision || String(row.sourceRecordId) !== selected.cabinetItem.sourceRecordId) conflict();
      await db.fence("CabinetItem",{ _id: row._id, patientId: req.patient._id, revision: row.revision },s);
      const source = await db.insert("SourceRecord",{ provider: selected.provider, externalId: selected.externalId, sourceUrl: selected.sourceUrl, retrievedAt: selected.retrievedAt, contentHash: selected.contentHash, snapshot: { product: selected.product, ingredients: selected.ingredients }, matchStatus: "confirmed" },s);
      const doc = { ...filter(req), cabinetRevision: row.revision, productId: selected.externalId, sourceRecordId: source._id, ingredients: selected.ingredients, confirmedBy: req.actorId, confirmedAt: now() };
      return publicDoc(old ? await db.update("IngredientConfirmation",{ _id: old._id, revision: old.revision },doc,s) : await db.insert("IngredientConfirmation",doc,s));
    },200,async () => {
      selected = await candidate(req);
      if (selected.contentHash !== b.expectedContentHash || selected.cabinetItem.revision !== b.expectedCabinetRevision) conflict();
    });
  });
  async function view(req,row) {
    const current = await Promise.all(row.ingredientSnapshots.map(x => db.one("CabinetItem",{ _id: id(x.cabinetItemId), patientId: req.patient._id })));
    return { ...publicDoc(row), itemsChanged: current.some((x,i) => !x || x.status !== "active" || x.revision !== row.ingredientSnapshots[i].revision) };
  }
  patient.post("/ingredient-reviews",csrf,scope("cabinet.write"),async (req,res) => {
    object(req.body,["cabinetItemIds"],["cabinetItemIds"]);
    const ids = req.body.cabinetItemIds;
    if (!Array.isArray(ids) || ids.length < 2 || ids.length > 20 || new Set(ids).size !== ids.length) invalid("Select 2–20 different cabinet medicines.");
    ids.forEach(id);
    await mutate(req,res,"cabinet.write",async s => {
      const snapshots = [], evidenceRefs = [], byIngredient = new Map();
      for (const itemId of ids) {
        const row = await db.one("CabinetItem",{ _id: id(itemId), patientId: req.patient._id },s);
        if (!row) fail(404,"NOT_FOUND","Medicine not found.");
        await db.fence("CabinetItem",{ _id: row._id, patientId: req.patient._id },s);
        const saved = await db.one("IngredientConfirmation",{ patientId: req.patient._id, cabinetItemId: row._id },s);
        const src = saved && await db.one("SourceRecord",{ _id: saved.sourceRecordId, provider: "rxnorm_ingredients", matchStatus: "confirmed" },s);
        const valid = row.status === "active" && saved && src && saved.cabinetRevision === row.revision && saved.productId === await product(row,s) && saved.ingredients.length > 0;
        const snapshot = { cabinetItemId: String(row._id), revision: row.revision, displayName: row.displayName, strengthText: row.strengthText || "", form: row.form || "", ingredients: valid ? saved.ingredients : [], reason: valid ? null : "ingredient_confirmation_missing_or_outdated" };
        snapshots.push(snapshot);
        if (valid) {
          await db.fence("IngredientConfirmation",{ _id: saved._id, revision: saved.revision },s);
          evidenceRefs.push({ cabinetItemId: itemId, kind: "ingredient_identity", source: publicDoc(src), confirmedBy: String(saved.confirmedBy), confirmedAt: saved.confirmedAt });
          for (const ing of saved.ingredients) {
            const match = byIngredient.get(ing.externalId) || { ...ing, cabinetItemIds: [] };
            match.cabinetItemIds.push(itemId); byIngredient.set(ing.externalId,match);
          }
        }
        const card = await db.one("MedicineCard",{ patientId: req.patient._id, cabinetItemId: row._id },s);
        const label = card?.availability === "available" && card.itemSnapshot?.revision === row.revision && card.itemSnapshot?.rxcui === await product(row,s) && await db.one("SourceRecord",{ _id: card.sourceRecordId, provider: "openfda" },s);
        evidenceRefs.push(label ? { cabinetItemId: itemId, kind: "label_passages", source: sourceRef(label), passages: card.selectedPassages, applicabilityConfirmedAt: card.applicabilityConfirmedAt } : { cabinetItemId: itemId, kind: "label_unavailable", reason: "No current applicability-confirmed label passages saved." });
      }
      const overlaps = [...byIngredient.values()].filter(x => x.cabinetItemIds.length > 1);
      if (Buffer.byteLength(JSON.stringify(evidenceRefs)) > 1024 * 1024) invalid("The selected source passages exceed the review size limit. Compare fewer medicines; passages are never silently truncated.");
      const result = snapshots.some(x => x.reason) ? "insufficient_information" : overlaps.length ? "overlap" : "no_overlap_in_confirmed_ingredients";
      return publicDoc(await db.insert("IngredientReview",{ patientId: req.patient._id, cabinetItemIds: ids.map(id), ingredientSnapshots: snapshots, evidenceRefs, overlaps, result },s));
    });
  });
  patient.get("/ingredient-reviews",scope("cabinet.read"),async (req,res) => {
    const query = { patientId: req.patient._id };
    if (Object.keys(req.query).some(k => k !== "before")) fail(400,"INVALID_QUERY","Use the history cursor only.");
    if (req.query.before) query._id = { $lt: id(req.query.before) };
    const rows = await db.list("IngredientReview",query,21,undefined,{ _id: -1 });
    send(req,res,{ reviews: await Promise.all(rows.slice(0,20).map(row => view(req,row))), next: rows.length > 20 ? String(rows[19]._id) : null });
  });
  patient.get("/ingredient-reviews/:reviewId",scope("cabinet.read"),async (req,res) => {
    const row = await db.one("IngredientReview",{ _id: id(req.params.reviewId), patientId: req.patient._id });
    if (!row) fail(404,"NOT_FOUND","Review not found.");
    send(req,res,await view(req,row));
  });
  patient.post("/ingredient-reviews/:reviewId/acknowledge",csrf,scope("cabinet.write"),async (req,res) => {
    object(req.body,["expectedRevision","note"],["expectedRevision"]);
    if (!Number.isInteger(req.body.expectedRevision) || req.body.expectedRevision < 0 || (req.body.note !== undefined && (typeof req.body.note !== "string" || req.body.note.length > 2000))) invalid("Use the current revision and a note up to 2000 characters.");
    await mutate(req,res,"cabinet.write",async s => {
      const row = await db.one("IngredientReview",{ _id: id(req.params.reviewId), patientId: req.patient._id },s);
      if (!row) fail(404,"NOT_FOUND","Review not found.");
      if (row.revision !== req.body.expectedRevision || row.acknowledgedAt) conflict();
      return publicDoc(await db.update("IngredientReview",{ _id: row._id, revision: row.revision },{ acknowledgedAt: now(), acknowledgedBy: req.actorId, note: req.body.note?.trim() || "" },s));
    },200);
  });
}
