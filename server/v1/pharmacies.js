import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { validArea } from "./overpass.js";

const selectionLifetime = 10 * 60000;
const listingLifetime = 24 * 3600000;
const coordinate = /^-?\d{1,3}(\.\d{1,8})?$/;

export function installPharmacies(
  patient,
  {
    db,
    csrf,
    scope,
    mutate,
    fail,
    id,
    object,
    publicDoc,
    now,
    send,
    overpass,
    createTask,
    taskDate,
  },
) {
  const secret = randomBytes(32);
  const mac = (encoded) =>
    createHmac("sha256", secret).update(encoded).digest();
  const scopeFor = (req) => ({
    patient: String(req.patient._id),
    actor: String(req.actorId),
  });
  function sign(req, listing, source) {
    const { distanceMeters, ...snapshot } = listing;
    const payload = Buffer.from(
      JSON.stringify({
        ...scopeFor(req),
        expiresAt: now().getTime() + selectionLifetime,
        snapshot,
        ...source,
      }),
    ).toString("base64url");
    return payload + "." + mac(payload).toString("base64url");
  }
  function verify(req, token, externalPlaceKey) {
    if (
      typeof token !== "string" ||
      token.length > 4096 ||
      !/^[\w-]+\.[\w-]{43}$/.test(token)
    )
      return null;
    const [encoded, signature] = token.split(".");
    const expected = mac(encoded);
    const provided = Buffer.from(signature, "base64url");
    if (
      provided.length !== expected.length ||
      !timingSafeEqual(expected, provided)
    )
      return null;
    const value = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    );
    const scope = scopeFor(req);
    if (
      value.actor !== scope.actor ||
      value.patient !== scope.patient ||
      value.expiresAt <= now().getTime() ||
      value.snapshot.externalPlaceKey !== externalPlaceKey ||
      stale(value)
    )
      return null;
    return value;
  }
  function stale(row) {
    return (
      new Date(row.retrievedAt).getTime() <= now().getTime() - listingLifetime
    );
  }
  const view = (row) => (row ? { ...row, stale: stale(row) } : null);
  const conflict = () =>
    fail(
      409,
      "REVISION_CONFLICT",
      "Refresh the checklist or saved pharmacy and retry.",
    );

  patient.get("/pharmacies", scope("stock.read"), async (req, res) => {
    const { latitude, longitude, radiusMeters } = req.query;
    if (
      Object.keys(req.query).length !== 3 ||
      typeof latitude !== "string" ||
      !coordinate.test(latitude) ||
      typeof longitude !== "string" ||
      !coordinate.test(longitude) ||
      typeof radiusMeters !== "string" ||
      !/^\d{1,4}$/.test(radiusMeters) ||
      !validArea(Number(latitude), Number(longitude), Number(radiusMeters))
    )
      fail(
        400,
        "INVALID_QUERY",
        "Enter a latitude, longitude and a radius of 100–5000 meters.",
      );
    let result;
    try {
      result = await overpass.search(
        Number(latitude),
        Number(longitude),
        Number(radiusMeters),
      );
    } catch {
      fail(
        503,
        "OVERPASS_UNAVAILABLE",
        "Pharmacy lookup is unavailable. Retry shortly. Saved preferences are retained.",
      );
    }
    const { listings, limited, ...source } = result;
    send(req, res, {
      ...source,
      limited,
      listings: listings.map((entry) => ({
        ...entry,
        selectionToken: sign(req, entry, source),
      })),
    });
  });

  patient.get(
    "/pharmacy-preferences",
    scope("stock.read"),
    async (req, res) => {
      const preference = await db.one("PharmacyPreference", {
        patientId: req.patient._id,
      });
      send(req, res, view(publicDoc(preference)));
    },
  );

  patient.post(
    "/pharmacy-preferences",
    csrf,
    scope("stock.write"),
    async (req, res) => {
      const fields = ["externalPlaceKey", "selectionToken", "expectedRevision"];
      const b = object(req.body, fields, fields);
      if (
        typeof b.externalPlaceKey !== "string" ||
        !/^(node|way|relation)\/[1-9]\d{0,15}$/.test(b.externalPlaceKey) ||
        (b.expectedRevision !== null &&
          (!Number.isInteger(b.expectedRevision) || b.expectedRevision < 0))
      )
        fail(
          422,
          "VALIDATION_ERROR",
          "Choose a returned pharmacy and use the current preference revision.",
        );
      await mutate(
        req,
        res,
        "stock.write",
        async (s) => {
          const selection = verify(req, b.selectionToken, b.externalPlaceKey);
          if (!selection)
            fail(
              409,
              "PHARMACY_SELECTION_EXPIRED",
              "Search again and select a current pharmacy listing.",
            );
          const filter = { patientId: req.patient._id };
          const old = await db.one("PharmacyPreference", filter, s);
          if (b.expectedRevision !== (old?.revision ?? null)) conflict();
          const values = {
            externalPlaceKey: b.externalPlaceKey,
            listingSnapshot: selection.snapshot,
            retrievedAt: selection.retrievedAt,
            dataTimestamp: selection.dataTimestamp,
            sourceUrl: selection.sourceUrl,
            savedByUserId: req.actorId,
          };
          const saved = old
            ? await db.update(
                "PharmacyPreference",
                { ...filter, revision: old.revision },
                values,
                s,
              )
            : await db.insert(
                "PharmacyPreference",
                { ...filter, ...values },
                s,
              );
          if (!saved) conflict();
          return publicDoc(saved);
        },
        201,
        undefined,
        view,
      );
    },
  );

  const collectionPermissions = ["stock.write", "task.write"];
  patient.post(
    "/refill-lists/:listId/collection-task",
    csrf,
    scope(collectionPermissions),
    async (req, res) => {
      const b = object(
        req.body,
        [
          "expectedRevision",
          "assigneeUserId",
          "pharmacyPreferenceId",
          "expectedPharmacyRevision",
          "dueAtUTC",
        ],
        ["expectedRevision", "assigneeUserId"],
      );
      if (
        !Number.isInteger(b.expectedRevision) ||
        b.expectedRevision < 0 ||
        (b.pharmacyPreferenceId !== undefined
          ? !Number.isInteger(b.expectedPharmacyRevision) ||
            b.expectedPharmacyRevision < 0
          : b.expectedPharmacyRevision !== undefined)
      )
        fail(
          422,
          "VALIDATION_ERROR",
          "Use the current checklist and selected pharmacy revisions.",
        );
      const assigneeUserId = id(b.assigneeUserId);
      const dueAtUTC =
        b.dueAtUTC === undefined ? undefined : taskDate(b.dueAtUTC);
      const listKey = {
        _id: id(req.params.listId),
        patientId: req.patient._id,
      };
      const preferenceId =
        b.pharmacyPreferenceId === undefined
          ? null
          : id(b.pharmacyPreferenceId);
      await mutate(req, res, collectionPermissions, async (s) => {
        const list = await db.one("RefillList", listKey, s);
        if (!list) fail(404, "NOT_FOUND", "Refill checklist not found.");
        if (list.collectionTaskId)
          fail(
            409,
            "COLLECTION_TASK_EXISTS",
            "This checklist already has a collection task.",
          );
        if (list.status !== "open")
          fail(409, "REFILL_LIST_CLOSED", "Choose an open checklist.");
        if (list.revision !== b.expectedRevision) conflict();
        let location = {};
        if (preferenceId) {
          const saved = await db.one(
            "PharmacyPreference",
            { _id: preferenceId, patientId: req.patient._id },
            s,
          );
          if (!saved) fail(404, "NOT_FOUND", "Saved pharmacy not found.");
          if (saved.revision !== b.expectedPharmacyRevision) conflict();
          if (stale(saved))
            fail(
              409,
              "PHARMACY_LISTING_STALE",
              "Search again and save a fresh listing before assigning collection.",
            );
          location = {
            pharmacyPreferenceId: saved._id,
            pharmacySnapshot: {
              ...saved.listingSnapshot,
              sourceUrl: saved.sourceUrl,
              retrievedAt: saved.retrievedAt,
              dataTimestamp: saved.dataTimestamp,
            },
          };
        }
        const task = await createTask(
          req,
          {
            assigneeUserId,
            dueAtUTC,
            type: "refill",
            title: "Collect a refill",
            description:
              "Coordinate the linked refill checklist with the patient owner. Confirm pickup details directly.",
            refillListId: list._id,
            ...location,
          },
          undefined,
          s,
        );
        const updated = await db.update(
          "RefillList",
          { ...listKey, revision: list.revision },
          { collectionTaskId: id(task.id) },
          s,
        );
        if (!updated) conflict();
        return {
          task,
          refillListId: String(updated._id),
          refillListRevision: updated.revision,
        };
      });
    },
  );
}
