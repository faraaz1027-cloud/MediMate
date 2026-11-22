const scale = 1_000_000n;

// Decimal strings and integer micro-units keep fractional refills and reversals exact.
export function quantityMicros(value) {
  if (typeof value !== "string" || !/^-?\d{1,12}(\.\d{1,6})?$/.test(value))
    return null;
  const [whole, fraction = ""] = value.replace(/^-/, "").split(".");
  const amount = BigInt(whole) * scale + BigInt(fraction.padEnd(6, "0"));
  return value.startsWith("-") ? -amount : amount;
}

export function decimalQuantity(micros) {
  const n = BigInt(String(micros));
  const magnitude = n < 0n ? -n : n;
  const fraction = String(magnitude % scale)
    .padStart(6, "0")
    .replace(/0+$/, "");
  return `${n < 0n ? "-" : ""}${magnitude / scale}${fraction ? "." + fraction : ""}`;
}

export function stockKey(row) {
  return { patientId: row.patientId, cabinetItemId: row.cabinetItemId };
}

export async function appendStock(db, account, delta, entry, session) {
  const balance = BigInt(String(account.balanceMicros)) + delta;
  const updated = await db.update(
    "InventorySettings",
    { _id: account._id, revision: account.revision },
    { balanceMicros: String(balance), opened: true },
    session,
  );
  if (!updated) throw Error("Inventory revision changed inside transaction.");
  const transaction = await db.insert(
    "StockTransaction",
    {
      ...stockKey(account),
      ...entry,
      unit: account.stockUnit,
      deltaMicros: String(delta),
    },
    session,
  );
  return { account: updated, transaction };
}

export async function syncDoseStock(db, dose, state, entry, session) {
  const key = stockKey(dose);
  const base = {
    stockSyncStatus: "not_applicable",
    stockIssue: null,
    stockDeductionId: null,
    stockActionId: null,
  };
  if (state !== "taken") {
    if (!dose.stockDeductionId) return base;
    const debit = await db.one(
      "StockTransaction",
      {
        ...key,
        _id: dose.stockDeductionId,
        reason: "dose_deduction",
      },
      session,
    );
    const account = await db.one("InventorySettings", key, session);
    if (!debit || !account || account.stockUnit !== debit.unit)
      throw Error("Saved deduction requires its original inventory account.");
    await appendStock(
      db,
      account,
      -BigInt(String(debit.deltaMicros)),
      {
        ...entry,
        reason: "dose_reversal",
        operationKey: "reversal:" + debit._id,
        reversesTransactionId: debit._id,
      },
      session,
    );
    return base;
  }
  const review = (stockIssue) => ({
    ...base,
    stockIssue,
    stockSyncStatus: "needs_review",
    stockActionId: entry.sourceDoseActionId,
  });
  const item = await db.one(
    "CabinetItem",
    {
      _id: dose.cabinetItemId,
      patientId: dose.patientId,
      status: "active",
    },
    session,
  );
  if (!item) return review("ITEM_INACTIVE");
  // Coordinate with cabinet archival, including a concurrent archive during deduction.
  await db.fence("CabinetItem", { _id: item._id, status: "active" }, session);
  const account = await db.one("InventorySettings", key, session);
  if (!account?.opened) return review("OPENING_REQUIRED");
  const amount = quantityMicros(String(dose.doseQuantitySnapshot));
  if (
    account.stockUnit !== dose.doseUnitSnapshot ||
    amount === null ||
    amount <= 0n
  )
    return review("UNIT_OR_QUANTITY_UNAVAILABLE");
  if (BigInt(String(account.balanceMicros)) < amount)
    return review("INSUFFICIENT_STOCK");
  const { transaction } = await appendStock(
    db,
    account,
    -amount,
    {
      ...entry,
      reason: "dose_deduction",
      operationKey: "dose:" + entry.sourceDoseActionId,
    },
    session,
  );
  return {
    ...base,
    stockSyncStatus: "applied",
    stockDeductionId: transaction._id,
    stockActionId: entry.sourceDoseActionId,
  };
}
