import mongoose from "mongoose";
import {
  appendStock,
  decimalQuantity,
  quantityMicros,
  stockKey,
  syncDoseStock,
} from "./stockLedger.js";

const stockUnits = [
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
const zero = "0";
const checklistLimit = 50;

export function installInventory(
  patient,
  { db, csrf, scope, mutate, fail, id, object, text, publicDoc, now, send },
) {
  const invalid = (path, message) =>
    fail(422, "VALIDATION_ERROR", message, [{ path, message }]);
  const conflict = () =>
    fail(
      409,
      "REVISION_CONFLICT",
      "Reload inventory or the checklist and try again.",
    );
  function amount(value, path, condition) {
    const parsed = quantityMicros(value);
    if (parsed === null || !condition(parsed))
      invalid(
        path,
        "Enter a valid decimal quantity with up to six decimal places.",
      );
    return parsed;
  }
  function revision(expected, current) {
    if (expected !== null && (!Number.isInteger(expected) || expected < 0))
      invalid(
        "expectedRevision",
        "Use the current revision or null before setup.",
      );
    if (expected !== (current?.revision ?? null)) conflict();
  }
  function stockUnit(unit) {
    if (!stockUnits.includes(unit))
      invalid("stockUnit", "Choose a supported stock unit.");
    return unit;
  }
  const low = (account) =>
    !!account?.opened &&
    BigInt(String(account.balanceMicros)) <=
      BigInt(String(account.thresholdMicros));
  function summary(item, account) {
    return {
      cabinetItemId: String(item._id),
      medicineText: item.displayName,
      itemStatus: item.status,
      revision: account?.revision ?? null,
      unit: account?.stockUnit ?? null,
      balance: account?.opened ? decimalQuantity(account.balanceMicros) : null,
      lowStockThreshold: account
        ? decimalQuantity(account.thresholdMicros)
        : null,
      lowStock: low(account),
    };
  }
  async function cabinet(req, itemId, session, active = false) {
    const item = await db.one(
      "CabinetItem",
      { _id: id(itemId), patientId: req.patient._id },
      session,
    );
    if (!item) fail(404, "NOT_FOUND", "Cabinet item not found.");
    if (active && item.status !== "active")
      fail(409, "ITEM_INACTIVE", "Archived items retain their stock history.");
    return item;
  }
  const key = (req, item) => ({
    patientId: req.patient._id,
    cabinetItemId: item._id,
  });
  const accountFor = (req, item, session) =>
    db.one("InventorySettings", key(req, item), session);
  const fence = (item, session) =>
    db.fence("CabinetItem", { _id: item._id, status: "active" }, session);

  async function page(req, model, filter, queryKeys = ["cursor", "limit"]) {
    const { cursor, limit: rawLimit = "20" } = req.query;
    if (
      Object.keys(req.query).some((k) => !queryKeys.includes(k)) ||
      typeof rawLimit !== "string" ||
      !/^([1-9][0-9]?|100)$/.test(rawLimit)
    )
      fail(400, "INVALID_QUERY", "Use a limit from 1 to 100.");
    const limit = Number(rawLimit);
    if (cursor !== undefined) filter._id = { $lt: id(cursor) };
    const rows = await db.list(model, filter, limit + 1, undefined, {
      _id: -1,
    });
    const more = rows.length > limit;
    rows.splice(limit);
    return {
      rows,
      meta: { nextCursor: more ? String(rows.at(-1)._id) : null },
    };
  }

  async function coverage(item, account, session) {
    const unavailable = {
      coverageStatus: "unavailable",
      coverageDays: null,
      firstUncoveredAtUTC: null,
    };
    if (!account?.opened || item.status !== "active") return unavailable;
    const at = now();
    const schedules = await db.list(
      "Schedule",
      { ...stockKey(account), status: "active" },
      101,
      session,
    );
    if (!schedules.length || schedules.length > 100) return unavailable;
    const events = await db.list(
      "DoseOccurrence",
      {
        ...stockKey(account),
        scheduleId: { $in: schedules.map((s) => s._id) },
        state: "pending",
        dueAtUTC: { $gte: at },
      },
      2001,
      session,
      { dueAtUTC: 1, _id: 1 },
    );
    if (!events.length || events.length > 2000) return unavailable;
    const quantities = events.map((event) =>
      event.doseUnitSnapshot === account.stockUnit
        ? quantityMicros(String(event.doseQuantitySnapshot))
        : null,
    );
    if (quantities.some((q) => q === null || q <= 0n)) return unavailable;
    let remaining = BigInt(String(account.balanceMicros));
    for (const [index, quantity] of quantities.entries()) {
      remaining -= quantity;
      if (remaining < 0n) {
        const first = events[index].dueAtUTC;
        return {
          coverageStatus: "first_uncovered",
          coverageDays: Math.floor((first - at) / 864000) / 100,
          firstUncoveredAtUTC: first,
        };
      }
    }
    return { ...unavailable, coverageStatus: "covers_remaining_course" };
  }

  const ledgerEntry = (row) => ({
    id: String(row._id),
    delta: decimalQuantity(row.deltaMicros),
    unit: row.unit,
    reason: row.reason,
    actorUserId: String(row.actorUserId),
    recordedAt: row.recordedAt,
    note: row.note || "",
    sourceDoseActionId: row.sourceDoseActionId
      ? String(row.sourceDoseActionId)
      : null,
    reversesTransactionId: row.reversesTransactionId
      ? String(row.reversesTransactionId)
      : null,
  });
  const pendingFilter = (req, item) => ({
    ...key(req, item),
    state: "taken",
    stockSyncStatus: "needs_review",
  });
  const pendingView = (dose) => ({
    id: String(dose._id),
    actionRevision: dose.actionRevision,
    dueAtUTC: dose.dueAtUTC,
    stockIssue: dose.stockIssue,
  });

  patient.get("/inventory-items", scope("stock.read"), async (req, res) => {
    const { rows, meta } = await page(req, "CabinetItem", {
      patientId: req.patient._id,
    });
    send(
      req,
      res,
      await Promise.all(
        rows.map(async (item) => summary(item, await accountFor(req, item))),
      ),
      200,
      meta,
    );
  });
  patient.get(
    "/cabinet-items/:itemId/stock",
    scope("stock.read"),
    async (req, res) => {
      const result = await db.transaction(async (session) => {
        const item = await cabinet(req, req.params.itemId, session);
        const account = await accountFor(req, item, session);
        const pending = await db.list(
          "DoseOccurrence",
          pendingFilter(req, item),
          21,
          session,
          { _id: -1 },
        );
        return {
          ...summary(item, account),
          ...(await coverage(item, pending.length ? null : account, session)),
          stockSyncStatus: pending.length ? "needs_review" : "clear",
          nextPendingCursor:
            pending.length > 20 ? String(pending[19]._id) : null,
          pendingDeductions: pending.slice(0, 20).map(pendingView),
        };
      });
      send(req, res, result);
    },
  );
  patient.get(
    "/cabinet-items/:itemId/stock-reconciliation",
    scope("stock.read"),
    async (req, res) => {
      const item = await cabinet(req, req.params.itemId);
      const { rows, meta } = await page(
        req,
        "DoseOccurrence",
        pendingFilter(req, item),
      );
      send(req, res, rows.map(pendingView), 200, meta);
    },
  );
  patient.get(
    "/cabinet-items/:itemId/stock-transactions",
    scope("stock.read"),
    async (req, res) => {
      const item = await cabinet(req, req.params.itemId);
      const { rows, meta } = await page(
        req,
        "StockTransaction",
        key(req, item),
      );
      send(req, res, rows.map(ledgerEntry), 200, meta);
    },
  );
  patient.put(
    "/cabinet-items/:itemId/inventory-settings",
    csrf,
    scope("stock.write"),
    async (req, res) => {
      const fields = ["expectedRevision", "stockUnit", "lowStockThreshold"];
      const b = object(req.body, fields, fields);
      const unit = stockUnit(b.stockUnit);
      const threshold = amount(
        b.lowStockThreshold,
        "lowStockThreshold",
        (n) => n >= 0n,
      );
      await mutate(
        req,
        res,
        "stock.write",
        async (session) => {
          const item = await cabinet(req, req.params.itemId, session, true);
          await fence(item, session);
          const account = await accountFor(req, item, session);
          revision(b.expectedRevision, account);
          if (account?.opened && unit !== account.stockUnit)
            fail(
              409,
              "STOCK_UNIT_LOCKED",
              "The opening count locks the stock unit.",
            );
          const fields = {
            stockUnit: unit,
            thresholdMicros: String(threshold),
          };
          const next = account
            ? await db.update(
                "InventorySettings",
                { _id: account._id, revision: account.revision },
                fields,
                session,
              )
            : await db.insert(
                "InventorySettings",
                {
                  ...key(req, item),
                  ...fields,
                  opened: false,
                  balanceMicros: zero,
                },
                session,
              );
          if (!next) conflict();
          return summary(item, next);
        },
        200,
      );
    },
  );
  patient.post(
    "/cabinet-items/:itemId/stock-transactions",
    csrf,
    scope("stock.write"),
    async (req, res) => {
      const b = object(
        req.body,
        ["expectedRevision", "delta", "unit", "reason", "note"],
        ["expectedRevision", "delta", "unit", "reason"],
      );
      if (!["opening", "refill", "correction"].includes(b.reason))
        invalid("reason", "Choose opening, refill or correction.");
      const delta = amount(b.delta, "delta", (n) =>
        b.reason === "correction"
          ? n !== 0n
          : b.reason === "opening"
            ? n >= 0n
            : n > 0n,
      );
      const note =
        b.reason === "correction" || (b.note !== undefined && b.note !== "")
          ? text(b.note, "note", 500)
          : "";
      await mutate(req, res, "stock.write", async (session) => {
        const item = await cabinet(req, req.params.itemId, session, true);
        await fence(item, session);
        const account = await accountFor(req, item, session);
        revision(b.expectedRevision, account);
        if (!account || b.unit !== account.stockUnit)
          fail(
            409,
            "STOCK_UNIT_REQUIRED",
            "Save the stock unit and use it for every entry.",
          );
        if (account.opened === (b.reason === "opening"))
          fail(
            409,
            "OPENING_STATE",
            "Record the opening count once, before refills or corrections.",
          );
        if (BigInt(String(account.balanceMicros)) + delta < 0n)
          fail(
            409,
            "NEGATIVE_STOCK",
            "This correction would make stock negative.",
          );
        const result = await appendStock(
          db,
          account,
          delta,
          {
            reason: b.reason,
            note,
            actorUserId: req.actorId,
            recordedAt: now(),
            operationKey: `manual:${item._id}:${req.actorId}:${req.get("Idempotency-Key")}`,
          },
          session,
        );
        return {
          stock: summary(item, result.account),
          transaction: ledgerEntry(result.transaction),
        };
      });
    },
  );
  patient.post(
    "/cabinet-items/:itemId/stock-reconciliation/:doseId",
    csrf,
    scope("stock.write"),
    async (req, res) => {
      const b = object(
        req.body,
        ["expectedActionRevision"],
        ["expectedActionRevision"],
      );
      if (
        !Number.isInteger(b.expectedActionRevision) ||
        b.expectedActionRevision < 1
      )
        invalid(
          "expectedActionRevision",
          "Use the current dose action revision.",
        );
      await mutate(
        req,
        res,
        "stock.write",
        async (session) => {
          const item = await cabinet(req, req.params.itemId, session, true);
          const dose = await db.one(
            "DoseOccurrence",
            { ...key(req, item), _id: id(req.params.doseId) },
            session,
          );
          if (!dose)
            fail(404, "NOT_FOUND", "Dose event not found for this item.");
          if (
            dose.actionRevision !== b.expectedActionRevision ||
            dose.state !== "taken" ||
            dose.stockSyncStatus !== "needs_review" ||
            !dose.stockActionId
          )
            conflict();
          const stock = await syncDoseStock(
            db,
            dose,
            "taken",
            {
              sourceDoseActionId: dose.stockActionId,
              actorUserId: req.actorId,
              recordedAt: now(),
              note: "Reviewed by a stock editor",
            },
            session,
          );
          const updated = await db.update(
            "DoseOccurrence",
            { _id: dose._id, revision: dose.revision },
            stock,
            session,
          );
          if (!updated) conflict();
          return {
            doseId: String(dose._id),
            stockSyncStatus: stock.stockSyncStatus,
            stockIssue: stock.stockIssue,
          };
        },
        200,
      );
    },
  );

  function listView(row) {
    const out = publicDoc(row);
    return {
      ...out,
      items: row.items.map((entry) => {
        const { _id, ...fields } = entry;
        return { ...fields, id: String(_id) };
      }),
    };
  }
  patient.get("/refill-lists", scope("stock.read"), async (req, res) => {
    const { status } = req.query;
    if (status !== undefined && !["open", "completed"].includes(status))
      fail(400, "INVALID_QUERY", "Choose open or completed status.");
    const { rows, meta } = await page(
      req,
      "RefillList",
      {
        patientId: req.patient._id,
        ...(status === undefined ? {} : { status }),
      },
      ["cursor", "limit", "status"],
    );
    send(req, res, rows.map(listView), 200, meta);
  });
  patient.post(
    "/refill-lists",
    csrf,
    scope("stock.write"),
    async (req, res) => {
      const b = object(req.body, ["items", "fromLowStock"]);
      const automatic = b.fromLowStock === true && b.items === undefined;
      if (
        !automatic &&
        (b.fromLowStock !== undefined ||
          !Array.isArray(b.items) ||
          !b.items.length ||
          b.items.length > checklistLimit)
      )
        invalid(
          "items",
          "Choose 1–50 items or generate a checklist from low stock.",
        );
      await mutate(req, res, "stock.write", async (session) => {
        const items = [];
        const seen = new Set();
        if (automatic) {
          const rows = await db.lowStock(
            req.patient._id,
            checklistLimit + 1,
            session,
          );
          if (!rows.length || rows.length > checklistLimit)
            fail(
              409,
              "LOW_STOCK_LIST_UNAVAILABLE",
              "A generated checklist needs 1–50 active low-stock items.",
            );
          for (const row of rows)
            items.push({
              cabinetItemId: row.cabinetItemId,
              medicineText: row.cabinet.displayName,
              unit: row.stockUnit,
              state: "needed",
            });
        } else {
          for (const entry of b.items) {
            object(
              entry,
              ["cabinetItemId", "requestedQuantity", "unit"],
              ["cabinetItemId", "unit"],
            );
            const item = await cabinet(req, entry.cabinetItemId, session, true);
            const account = await accountFor(req, item, session);
            if (seen.has(String(item._id)))
              invalid("items", "Include each cabinet item once.");
            seen.add(String(item._id));
            if (!account?.opened || entry.unit !== account.stockUnit)
              invalid(
                "unit",
                "Choose an item with an opening count and its matching stock unit.",
              );
            const requestedQuantity =
              entry.requestedQuantity === undefined
                ? null
                : decimalQuantity(
                    amount(
                      entry.requestedQuantity,
                      "requestedQuantity",
                      (n) => n > 0n,
                    ),
                  );
            items.push({
              cabinetItemId: item._id,
              medicineText: item.displayName,
              requestedQuantity,
              unit: account.stockUnit,
              state: "needed",
            });
          }
        }
        return listView(
          await db.insert(
            "RefillList",
            {
              patientId: req.patient._id,
              createdByUserId: req.actorId,
              status: "open",
              items: items.map((item) => ({
                ...item,
                _id: new mongoose.Types.ObjectId(),
              })),
            },
            session,
          ),
        );
      });
    },
  );
  async function changeList(req, res, complete) {
    const b = object(
      req.body,
      complete
        ? ["expectedRevision"]
        : ["expectedRevision", "state", "requestedQuantity"],
      complete ? ["expectedRevision"] : ["expectedRevision", "state"],
    );
    if (!complete && !["needed", "collected"].includes(b.state))
      invalid("state", "Choose needed or collected.");
    await mutate(
      req,
      res,
      "stock.write",
      async (session) => {
        const list = await db.one(
          "RefillList",
          { patientId: req.patient._id, _id: id(req.params.listId) },
          session,
        );
        if (!list) fail(404, "NOT_FOUND", "Refill checklist not found.");
        revision(b.expectedRevision, list);
        if (list.status !== "open")
          fail(409, "REFILL_LIST_CLOSED", "The checklist is already complete.");
        let changes;
        if (complete) {
          if (list.items.some((entry) => entry.state !== "collected"))
            fail(
              409,
              "REFILL_ITEMS_NEEDED",
              "Mark each item collected before completing the checklist.",
            );
          changes = { status: "completed", completedAt: now() };
        } else {
          const itemId = id(req.params.entryId);
          const found = list.items.find(
            (entry) => String(entry._id) === String(itemId),
          );
          if (!found) fail(404, "NOT_FOUND", "Checklist item not found.");
          const requestedQuantity =
            b.requestedQuantity === undefined
              ? found.requestedQuantity
              : b.requestedQuantity === null
                ? null
                : decimalQuantity(
                    amount(
                      b.requestedQuantity,
                      "requestedQuantity",
                      (n) => n > 0n,
                    ),
                  );
          const updated = {
            ...found,
            state: b.state,
            requestedQuantity,
            collectedAt:
              b.state === "collected" ? (found.collectedAt ?? now()) : null,
          };
          changes = {
            items: list.items.map((entry) =>
              entry === found ? updated : entry,
            ),
          };
        }
        const updated = await db.update(
          "RefillList",
          { _id: list._id, revision: list.revision },
          changes,
          session,
        );
        if (!updated) conflict();
        return listView(updated);
      },
      200,
    );
  }
  patient.patch(
    "/refill-lists/:listId/items/:entryId",
    csrf,
    scope("stock.write"),
    (req, res) => changeList(req, res, false),
  );
  patient.post(
    "/refill-lists/:listId/complete",
    csrf,
    scope("stock.write"),
    (req, res) => changeList(req, res, true),
  );
}
