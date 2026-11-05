import { useEffect, useRef, useState } from "react";
import ValidatedForm from "./ValidatedForm.jsx";
import PharmacyCoordination from "./PharmacyCoordination.jsx";

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
const decimal = "[0-9]{1,12}([.][0-9]{1,6})?";
const issues = {
  OPENING_REQUIRED: "Record an opening count to review this deduction.",
  INSUFFICIENT_STOCK: "The saved balance cannot cover this dose.",
  UNIT_OR_QUANTITY_UNAVAILABLE:
    "The saved dose quantity or unit is incompatible with this inventory.",
  ITEM_INACTIVE: "The medicine was archived before this deduction.",
};

export default function InventoryBoard({ api, patient, permissions, onBusy }) {
  const base = "/patients/" + patient;
  const read = permissions.includes("stock.read");
  const write = permissions.includes("stock.write");
  const [items, setItems] = useState({ data: [], meta: {} });
  const [lists, setLists] = useState({ data: [], meta: {} });
  const [selected, setSelected] = useState("");
  const [detail, setDetail] = useState(null);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const mutation = useRef(null);
  const locked = useRef(false);
  const stock = detail?.stock.cabinetItemId === selected ? detail.stock : null;
  const path = base + "/cabinet-items/" + selected;

  useEffect(() => {
    if (!read) return;
    let current = true;
    const controller = new AbortController();
    const options = { signal: controller.signal, isCurrent: () => current };
    setLoading(true);
    Promise.all([
      api(base + "/inventory-items", options),
      api(base + "/refill-lists", options),
      selected ? api(path + "/stock", options) : null,
      selected ? api(path + "/stock-transactions", options) : null,
    ])
      .then(([inventory, checklists, saved, history]) => {
        if (!current) return;
        setItems(inventory);
        setLists(checklists);
        setDetail(saved ? { stock: saved.data, history } : null);
        setLoading(false);
      })
      .catch((e) => {
        if (!current) return;
        setError(e.message);
        setItems({ data: [], meta: {} });
        setLists({ data: [], meta: {} });
        setDetail(null);
        setLoading(false);
      });
    return () => {
      current = false;
      controller.abort();
    };
  }, [patient, read, selected, refresh]);

  async function writeRequest(url, method, body, message) {
    if (locked.current) return;
    locked.current = true;
    setSaving(true);
    onBusy(true);
    setError("");
    setNotice("");
    const signature = JSON.stringify([url, method, body]);
    if (mutation.current?.signature !== signature)
      mutation.current = { signature, key: crypto.randomUUID() };
    try {
      const result = await api(url, {
        method,
        body: JSON.stringify(body),
        headers: { "Idempotency-Key": mutation.current.key },
      });
      mutation.current = null;
      setNotice(typeof message === "function" ? message(result.data) : message);
      setRefresh((n) => n + 1);
      return { data: result.data };
    } catch (error) {
      setError(error.message);
      return { error };
    } finally {
      locked.current = false;
      setSaving(false);
      onBusy(false);
    }
  }
  async function more(url, previous, apply) {
    if (locked.current) return;
    locked.current = true;
    setSaving(true);
    onBusy(true);
    setError("");
    try {
      const next = await api(
        url + "?cursor=" + encodeURIComponent(previous.meta.nextCursor),
      );
      apply({ data: [...previous.data, ...next.data], meta: next.meta });
    } catch (e) {
      setError(e.message);
    } finally {
      locked.current = false;
      setSaving(false);
      onBusy(false);
    }
  }
  if (!read)
    return <p>Stock viewing permission is required for this workspace.</p>;
  const disabled = saving || loading;
  const editable = stock?.itemStatus === "active" && write;
  return (
    <div className="dose-columns inventory-workspace">
      <div>
        <section className="card">
          <h2>Inventory and refills</h2>
          <p>Choose a saved medicine to review its count and stock history.</p>
          <label>
            Medicine for inventory
            <select
              value={selected}
              disabled={saving}
              onChange={(e) => setSelected(e.target.value)}
            >
              <option value="">Choose a medicine</option>
              {stock &&
                !items.data.some((item) => item.cabinetItemId === selected) && (
                  <option value={selected}>{stock.medicineText}</option>
                )}
              {items.data.map((item) => (
                <option key={item.cabinetItemId} value={item.cabinetItemId}>
                  {item.medicineText}
                  {item.itemStatus === "active" && item.lowStock
                    ? " · low stock"
                    : ""}
                  {item.itemStatus === "archived" ? " · archived" : ""}
                </option>
              ))}
            </select>
          </label>
          <button
            disabled={disabled}
            onClick={() => {
              setError("");
              setRefresh((n) => n + 1);
            }}
          >
            Refresh inventory
          </button>
          {items.meta.nextCursor && (
            <button
              disabled={disabled}
              onClick={() => more(base + "/inventory-items", items, setItems)}
            >
              More medicines
            </button>
          )}
          {loading && <p role="status">Loading inventory…</p>}
          {error && <p role="alert">{error}</p>}
          {notice && <p role="status">{notice}</p>}
        </section>
        {stock && (
          <section className="card">
            <h3>{stock.medicineText}</h3>
            <p>
              {stock.balance === null
                ? "Opening count required."
                : `Stock balance: ${stock.balance} ${stock.unit}`}
            </p>
            {stock.lowStock && stock.itemStatus === "active" && (
              <p>
                Low stock · threshold {stock.lowStockThreshold} {stock.unit}
              </p>
            )}
            {stock.itemStatus === "archived" && (
              <p>Archived medicine · stock history</p>
            )}
            <p>
              {stock.coverageStatus === "first_uncovered"
                ? `First uncovered dose: ${stock.firstUncoveredAtUTC} · ${stock.coverageDays} days from now.`
                : stock.coverageStatus === "covers_remaining_course"
                  ? "Saved stock covers the remaining scheduled doses."
                  : "Coverage estimate unavailable."}
            </p>
            {stock.coverageStatus !== "unavailable" && (
              <p>Estimate uses future pending doses on active schedules.</p>
            )}
            {editable && (
              <ValidatedForm
                key={selected + ":settings:" + stock.revision}
                onSubmit={(e) => {
                  const fields = new FormData(e.currentTarget);
                  return writeRequest(
                    path + "/inventory-settings",
                    "PUT",
                    {
                      expectedRevision: stock.revision,
                      stockUnit: fields.get("stockUnit"),
                      lowStockThreshold: fields.get("lowStockThreshold"),
                    },
                    "Inventory settings saved.",
                  );
                }}
              >
                <fieldset disabled={disabled}>
                  <legend>Stock settings</legend>
                  <label>
                    Stock unit
                    <select
                      required
                      name="stockUnit"
                      defaultValue={stock.unit || ""}
                    >
                      <option value="">Choose a unit</option>
                      {units.map((unit) => (
                        <option
                          key={unit}
                          disabled={
                            stock.balance !== null && unit !== stock.unit
                          }
                        >
                          {unit}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Low stock threshold
                    <input
                      required
                      name="lowStockThreshold"
                      inputMode="decimal"
                      pattern={decimal}
                      defaultValue={stock.lowStockThreshold ?? "0"}
                    />
                  </label>
                  <button>Save inventory settings</button>
                </fieldset>
              </ValidatedForm>
            )}
            {editable && stock.unit && (
              <ValidatedForm
                key={selected + ":entry:" + stock.revision}
                onSubmit={(e) => {
                  const fields = new FormData(e.currentTarget);
                  return writeRequest(
                    path + "/stock-transactions",
                    "POST",
                    {
                      expectedRevision: stock.revision,
                      reason: fields.get("reason"),
                      unit: stock.unit,
                      delta: fields.get("delta"),
                      note: fields.get("note"),
                    },
                    "Stock entry saved.",
                  );
                }}
              >
                <fieldset disabled={disabled}>
                  <legend>Record stock entry</legend>
                  <label>
                    Stock entry type
                    <select name="reason">
                      {stock.balance === null ? (
                        <option value="opening">Opening count</option>
                      ) : (
                        <>
                          <option value="refill">Refill</option>
                          <option value="correction">Correction</option>
                        </>
                      )}
                    </select>
                  </label>
                  <label>
                    Quantity change ({stock.unit})
                    <input
                      required
                      name="delta"
                      inputMode="decimal"
                      pattern={"-?" + decimal}
                    />
                  </label>
                  <label>
                    Stock entry note
                    <input name="note" maxLength={500} />
                  </label>
                  <p>
                    For a correction, enter a positive or negative change and
                    explain the reason.
                  </p>
                  <button>Save stock entry</button>
                </fieldset>
              </ValidatedForm>
            )}
            {!!stock.pendingDeductions.length && (
              <div>
                <h4>Deductions to review</h4>
                <p>
                  Check that the saved count excludes the selected dose before
                  posting its deduction.
                </p>
                <ul className="records">
                  {stock.pendingDeductions.map((dose) => (
                    <li key={dose.id}>
                      <p>
                        {dose.dueAtUTC} · {issues[dose.stockIssue]}
                      </p>
                      {editable && (
                        <button
                          disabled={disabled}
                          onClick={() =>
                            writeRequest(
                              path + "/stock-reconciliation/" + dose.id,
                              "POST",
                              { expectedActionRevision: dose.actionRevision },
                              (result) =>
                                result.stockSyncStatus === "applied"
                                  ? "Dose deduction posted."
                                  : issues[result.stockIssue],
                            )
                          }
                        >
                          Review and post deduction
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
                {stock.nextPendingCursor && (
                  <button
                    disabled={disabled}
                    onClick={() =>
                      more(
                        path + "/stock-reconciliation",
                        {
                          data: stock.pendingDeductions,
                          meta: { nextCursor: stock.nextPendingCursor },
                        },
                        (next) =>
                          setDetail({
                            ...detail,
                            stock: {
                              ...stock,
                              pendingDeductions: next.data,
                              nextPendingCursor: next.meta.nextCursor,
                            },
                          }),
                      )
                    }
                  >
                    More deductions to review
                  </button>
                )}
              </div>
            )}
            <h4>Stock history</h4>
            {detail.history.data.length === 0 && <p>No stock entries yet.</p>}
            <ul className="records">
              {detail.history.data.map((entry) => (
                <li key={entry.id}>
                  <p>
                    {entry.delta} {entry.unit} ·{" "}
                    {entry.reason.replaceAll("_", " ")} · {entry.recordedAt}
                  </p>
                  {entry.note && <p>{entry.note}</p>}
                  <p>Actor: {entry.actorUserId}</p>
                  {entry.sourceDoseActionId && (
                    <p>Dose action: {entry.sourceDoseActionId}</p>
                  )}
                </li>
              ))}
            </ul>
            {detail.history.meta.nextCursor && (
              <button
                disabled={disabled}
                onClick={() =>
                  more(
                    path + "/stock-transactions",
                    detail.history,
                    (history) => setDetail({ stock, history }),
                  )
                }
              >
                More stock history
              </button>
            )}
          </section>
        )}
      </div>
      <section className="card">
        <h3>Refill checklists</h3>
        <p>Collecting a checklist item is separate from recording a refill.</p>
        {write && (
          <button
            disabled={disabled}
            onClick={() =>
              writeRequest(
                base + "/refill-lists",
                "POST",
                { fromLowStock: true },
                "Low-stock checklist saved.",
              )
            }
          >
            Create checklist from low stock
          </button>
        )}
        {editable && stock.balance !== null && (
          <button
            disabled={disabled}
            onClick={() =>
              writeRequest(
                base + "/refill-lists",
                "POST",
                { items: [{ cabinetItemId: selected, unit: stock.unit }] },
                "Refill checklist saved.",
              )
            }
          >
            Create checklist for this medicine
          </button>
        )}
        {lists.data.length === 0 && <p>No saved refill checklists.</p>}
        {lists.data.map((list) => (
          <div key={list.id}>
            <h4>
              {list.status === "open"
                ? "Open checklist"
                : "Completed checklist"}{" "}
              · {new Date(list.createdAt).toLocaleDateString()}
            </h4>
            {list.collectionTaskId && <p>Collection task linked · {list.collectionTaskId}</p>}
            <ul className="records">
              {list.items.map((item) => (
                <li key={item.id}>
                  <p>
                    {item.medicineText} · {item.state}
                    {item.requestedQuantity
                      ? ` · ${item.requestedQuantity} ${item.unit}`
                      : ""}
                  </p>
                  {write && list.status === "open" && (
                    <ValidatedForm
                      key={item.id + ":" + list.revision}
                      onSubmit={(e) => {
                        const fields = new FormData(e.currentTarget);
                        return writeRequest(
                          base +
                            "/refill-lists/" +
                            list.id +
                            "/items/" +
                            item.id,
                          "PATCH",
                          {
                            expectedRevision: list.revision,
                            state: fields.get("state"),
                            requestedQuantity:
                              fields.get("requestedQuantity") || null,
                          },
                          "Checklist item saved.",
                        );
                      }}
                    >
                      <fieldset disabled={disabled}>
                        <legend>Update {item.medicineText}</legend>
                        <label>
                          Collection state
                          <select name="state" defaultValue={item.state}>
                            <option value="needed">Needed</option>
                            <option value="collected">Collected</option>
                          </select>
                        </label>
                        <label>
                          Requested quantity ({item.unit})
                          <input
                            name="requestedQuantity"
                            inputMode="decimal"
                            pattern={decimal}
                            defaultValue={item.requestedQuantity ?? ""}
                          />
                        </label>
                        <button>Save checklist item</button>
                      </fieldset>
                    </ValidatedForm>
                  )}
                </li>
              ))}
            </ul>
            {write && list.status === "open" && (
              <button
                disabled={
                  disabled ||
                  list.items.some((item) => item.state !== "collected")
                }
                onClick={() =>
                  writeRequest(
                    base + "/refill-lists/" + list.id + "/complete",
                    "POST",
                    { expectedRevision: list.revision },
                    "Refill checklist completed.",
                  )
                }
              >
                Complete checklist
              </button>
            )}
          </div>
        ))}
        {lists.meta.nextCursor && (
          <button
            disabled={disabled}
            onClick={() => more(base + "/refill-lists", lists, setLists)}
          >
            More checklists
          </button>
        )}
        <PharmacyCoordination api={api} base={base} lists={lists.data} permissions={permissions}
          disabled={disabled} refresh={refresh} writeRequest={writeRequest} />
      </section>
    </div>
  );
}
