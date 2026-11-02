import { useEffect, useRef, useState } from "react";
import ValidatedForm from "./ValidatedForm.jsx";
const localTime = (d) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: d.timezoneSnapshot,
    dateStyle: "medium",
    timeStyle: "short",
    hourCycle: "h23",
  }).format(new Date(d.dueAtUTC));
const jobStatus = (job) =>
  job.status === "sent"
    ? "Accepted by Telegram — not proof of reading"
    : job.status === "unknown"
      ? "Outcome unknown — automatic resend blocked"
      : job.status;

export default function DoseBoard({
  api,
  patient,
  permissions,
  owner,
  onBusy,
}) {
  const read = permissions.includes("dose.read"),
    write = permissions.includes("dose.record"),
    base = `/patients/${patient}`;
  const [date, setDate] = useState(""),
    [stateFilter, setStateFilter] = useState(""),
    [rows, setRows] = useState([]),
    [meta, setMeta] = useState(null),
    [cursor, setCursor] = useState(null),
    [loading, setLoading] = useState(false),
    [listError, setListError] = useState("");
  const [detail, setDetail] = useState(null),
    [opening, setOpening] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [saving, setSaving] = useState(false),
    [correction, setCorrection] = useState("pending"),
    [reason, setReason] = useState("");
  const [settings, setSettings] = useState(null),
    [settingsError, setSettingsError] = useState(""),
    [enabled, setEnabled] = useState(false);
  const alive = useRef(true),
    listEpoch = useRef(0),
    detailEpoch = useRef(0),
    lock = useRef(false),
    operation = useRef(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      listEpoch.current++;
      detailEpoch.current++;
    };
  }, [patient]);
  useEffect(() => {
    if (read) {
      reload();
      loadSettings();
    }
  }, [patient, read]);
  async function reload(
    append = false,
    selectedDate = date,
    selectedState = stateFilter,
  ) {
    const epoch = ++listEpoch.current;
    setLoading(true);
    setListError("");
    const qs = new URLSearchParams({
      limit: "20",
      ...(selectedDate ? { date: selectedDate } : {}),
      ...(selectedState ? { state: selectedState } : {}),
    });
    if (append && cursor) qs.set("cursor", cursor);
    try {
      const r = await api(base + "/doses?" + qs, {
        isCurrent: () => alive.current && epoch === listEpoch.current,
      });
      if (!alive.current || epoch !== listEpoch.current) return;
      setRows((old) => (append ? [...old, ...r.data] : r.data));
      setMeta({ ...r.meta, stateFilter: selectedState });
      setCursor(r.meta.nextCursor);
      if (!selectedDate && r.meta.date) setDate(r.meta.date);
    } catch (e) {
      if (alive.current && epoch === listEpoch.current) {
        setListError(e.message);
        if ([403, 404].includes(e.status)) {
          setRows([]);
          setDetail(null);
          setMeta(null);
        }
      }
    } finally {
      if (alive.current && epoch === listEpoch.current) setLoading(false);
    }
  }
  async function loadSettings() {
    setSettingsError("");
    try {
      const r = await api(base + "/dose-reminder-settings", {
        isCurrent: () => alive.current,
      });
      if (alive.current) {
        setSettings(r.data);
        setEnabled(r.data.enabled);
      }
    } catch (e) {
      if (alive.current) {
        setSettingsError(e.message);
        if ([403, 404].includes(e.status)) {
          setSettings(null);
          setRows([]);
          setDetail(null);
          setMeta(null);
        }
      }
    }
  }
  async function open(id) {
    const epoch = ++detailEpoch.current;
    setOpening(true);
    setDetail(null);
    setError("");
    setReason("");
    setCorrection("pending");
    try {
      const r = await api(`${base}/doses/${id}`, {
        isCurrent: () => alive.current && epoch === detailEpoch.current,
      });
      if (alive.current && epoch === detailEpoch.current) setDetail(r.data);
    } catch (e) {
      if (alive.current && epoch === detailEpoch.current) {
        setError(e.message);
        if ([403, 404].includes(e.status)) {
          setRows([]);
          setDetail(null);
          setSettings(null);
          setMeta(null);
        }
      }
    } finally {
      if (alive.current && epoch === detailEpoch.current) setOpening(false);
    }
  }
  async function more(kind) {
    const epoch = detailEpoch.current,
      id = detail.dose.id,
      c =
        kind === "actions"
          ? detail.nextActionCursor
          : detail.nextReminderCursor;
    setOpening(true);
    try {
      const r = await api(`${base}/doses/${id}/${kind}?limit=20&cursor=${c}`, {
        isCurrent: () => alive.current && epoch === detailEpoch.current,
      });
      if (alive.current && epoch === detailEpoch.current)
        setDetail((old) => ({
          ...old,
          [kind]: [...old[kind], ...r.data],
          [kind === "actions" ? "nextActionCursor" : "nextReminderCursor"]:
            r.meta.nextCursor,
        }));
    } catch (e) {
      if (alive.current && epoch === detailEpoch.current) {
        setError(e.message);
        if ([403, 404].includes(e.status)) {
          setRows([]);
          setDetail(null);
          setSettings(null);
          setMeta(null);
        }
      }
    } finally {
      if (alive.current && epoch === detailEpoch.current) setOpening(false);
    }
  }
  async function mutation(
    path,
    body,
    {
      method = "POST",
      doseId,
      action = false,
      message = "Saved to dose history.",
    } = {},
  ) {
    if (lock.current) return;
    lock.current = true;
    setSaving(true);
    onBusy(true);
    setError("");
    setNotice("");
    const signature = path + JSON.stringify(body);
    if (operation.current?.signature !== signature)
      operation.current = { signature, key: crypto.randomUUID() };
    const payload = {
      ...body,
      ...(action ? { clientRequestId: operation.current.key } : {}),
    };
    try {
      await api(base + path, {
        method,
        body: JSON.stringify(payload),
        headers: { "Idempotency-Key": operation.current.key },
        isCurrent: () => alive.current,
      });
      if (!alive.current) return;
      operation.current = null;
      await reload(false, meta?.date || date, meta?.stateFilter ?? stateFilter);
      if (doseId) await open(doseId);
      if (path === "/dose-reminder-settings") await loadSettings();
      setNotice(message);
    } catch (e) {
      if (alive.current) {
        setError(e.message);
        if ([403, 404].includes(e.status)) {
          setRows([]);
          setDetail(null);
          setSettings(null);
          setMeta(null);
        }
        return { error: e };
      }
    } finally {
      lock.current = false;
      if (alive.current) setSaving(false);
      onBusy(false);
    }
  }
  const record = (d, action) =>
    mutation(
      `/doses/${d.id}/actions`,
      { expectedRevision: d.actionRevision, action },
      { doseId: d.id, action: true },
    );
  const snooze = (d) =>
    mutation(
      `/doses/${d.id}/snoozes`,
      { expectedRevision: d.actionRevision, minutes: 10 },
      {
        doseId: d.id,
        action: true,
        message:
          "Reminder deferred 10 minutes. Scheduled time and dose status are unchanged.",
      },
    );
  function correct(e) {
    e.preventDefault();
    return mutation(
      `/doses/${detail.dose.id}/corrections`,
      {
        expectedRevision: detail.dose.actionRevision,
        newState: correction,
        reason,
      },
      {
        doseId: detail.dose.id,
        action: true,
        message: "Correction saved; prior actions remain in history.",
      },
    );
  }
  function saveSettings(e) {
    e.preventDefault();
    return mutation(
      "/dose-reminder-settings",
      {
        expectedRevision: settings.revision,
        enabled,
        ...(enabled ? { consent: true } : {}),
      },
      {
        method: "PUT",
        message:
          "Owner reminder preference saved. Channel readiness is shown separately.",
      },
    );
  }
  function applyFilters(event) {
    event.preventDefault();
    setDetail(null);
    setOpening(false);
    detailEpoch.current++;
    return reload(false, date, stateFilter);
  }
  const serverNow = Date.parse(meta?.serverNow || 0);
  return (
    <div className="dose-workspace">
      <h2>Today’s doses</h2>
      <p>
        Record what happened for each saved A2 occurrence. Reminders and dose
        records are separate.
      </p>
      {!read ? (
        <p>Dose read permission is required to open this work area.</p>
      ) : (
        <>
          <ValidatedForm className="dose-filters card" onSubmit={applyFilters}>
            <label>
              Local date
              <input
                type="date"
                name="date"
                required
                value={date}
                disabled={saving || loading}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
            <label>
              Dose status filter
              <select
                value={stateFilter}
                disabled={saving || loading}
                onChange={(e) => {
                  setStateFilter(e.target.value);
                }}
              >
                <option value="">All states</option>
                {["pending", "taken", "skipped", "cancelled"].map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
            </label>
            <button disabled={saving || loading}>Apply dose filters</button>
            <button
              type="button"
              disabled={saving || loading}
              onClick={() => {
                reload();
                loadSettings();
                if (detail) open(detail.dose.id);
              }}
            >
              Refresh doses
            </button>
            {meta && (
              <p>
                {meta.date} · {meta.timezone}. Last checked {meta.serverNow}.
                Refresh to see newly due events and worker updates.
              </p>
            )}
          </ValidatedForm>
          {notice && (
            <p className="success" role="status">
              {notice}
            </p>
          )}
          {error && (
            <div className="alert" role="alert">
              {error}
              <button
                disabled={saving || loading}
                onClick={() => {
                  reload();
                  if (detail) open(detail.dose.id);
                }}
              >
                Reload dose data
              </button>
            </div>
          )}
          <div className="dose-columns">
            <div>
              {loading && <p role="status">Loading saved dose events…</p>}
              {listError && (
                <div className="alert" role="alert">
                  {listError}
                  <button disabled={saving || loading} onClick={() => reload()}>
                    Retry doses
                  </button>
                </div>
              )}
              {!loading && !listError && !rows.length && (
                <section className="card">
                  <p>
                    No dose events in this view. Confirm an A2 schedule to
                    create events; this screen does not invent doses.
                  </p>
                </section>
              )}
              {rows.map((d) => {
                const due = Date.parse(d.dueAtUTC) <= serverNow,
                  pending = d.state === "pending";
                return (
                  <article
                    className="card dose-card"
                    data-testid={`dose-${d.id}`}
                    key={d.id}
                  >
                    <h3>Due {localTime(d)}</h3>
                    <p>{d.medicineText}</p>
                    <p>
                      Scheduled quantity: {d.doseQuantitySnapshot}{" "}
                      {d.doseUnitSnapshot}. Source strength:{" "}
                      {d.strengthText || "Not transcribed"}.
                    </p>
                    <p>
                      Dose status: {d.state}
                      {d.overdueUnconfirmed ? " · unconfirmed (past due)" : ""}
                    </p>
                    <p>
                      {d.timezoneSnapshot} · {d.dueAtUTC}
                    </p>
                    {pending && (
                      <>
                        <p>
                          Reminder time: {d.reminderDueAtUTC} · Snoozes:{" "}
                          {d.snoozeCount}/3
                        </p>
                        <div className="dose-actions">
                          <button
                            disabled={!write || saving || !due}
                            onClick={() => record(d, "taken")}
                          >
                            Record taken
                          </button>
                          <button
                            disabled={!write || saving || !due}
                            onClick={() => record(d, "skipped")}
                          >
                            Record skipped
                          </button>
                          <button
                            disabled={
                              !write ||
                              saving ||
                              !due ||
                              d.snoozeCount >= 3 ||
                              Date.parse(d.reminderDueAtUTC) > serverNow
                            }
                            onClick={() => snooze(d)}
                          >
                            Snooze reminder 10 min
                          </button>
                        </div>
                        {!due && (
                          <p>Actions become available at the saved due time.</p>
                        )}
                      </>
                    )}
                    <button
                      disabled={saving || opening}
                      onClick={() => open(d.id)}
                    >
                      View history
                    </button>
                  </article>
                );
              })}
              {cursor && (
                <button
                  disabled={saving || loading}
                  onClick={() => reload(true, meta.date, meta.stateFilter)}
                >
                  More dose events
                </button>
              )}
              {opening && <p role="status">Loading dose history…</p>}
              {detail && (
                <section className="card">
                  <h3>Dose action history</h3>
                  <p>
                    {detail.dose.medicineText} · {localTime(detail.dose)} ·
                    Current state: {detail.dose.state}
                  </p>
                  {!detail.actions.length && (
                    <p>
                      No action has been recorded. Pending does not mean
                      skipped.
                    </p>
                  )}
                  <ol className="records">
                    {detail.actions.map((a) => (
                      <li key={a.id}>
                        <strong>
                          {a.isCorrection ? "Correction: " : ""}
                          {a.action} · {a.previousState} → {a.newState}
                        </strong>
                        <p>
                          Recorded {a.recordedAt} · Effective {a.effectiveAt}
                        </p>
                        <p>Actor: {a.actorUserId}</p>
                        {a.reason && <p>{a.reason}</p>}
                      </li>
                    ))}
                  </ol>
                  {detail.nextActionCursor && (
                    <button
                      disabled={opening || saving}
                      onClick={() => more("actions")}
                    >
                      More action history
                    </button>
                  )}
                  {["taken", "skipped"].includes(detail.dose.state) && (
                    <ValidatedForm onSubmit={correct}>
                      <fieldset disabled={!write || saving}>
                        <legend>Correct this record</legend>
                        <label>
                          Corrected dose state
                          <select
                            name="newState"
                            value={correction}
                            onChange={(e) => setCorrection(e.target.value)}
                          >
                            {["pending", "taken", "skipped"].map((x) => (
                              <option
                                key={x}
                                value={x}
                                disabled={x === detail.dose.state}
                              >
                                {x}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Reason for correction
                          <textarea
                            name="reason"
                            required
                            maxLength={500}
                            rows={2}
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                          />
                        </label>
                        <p>
                          Prior actions remain visible. Returning to pending may
                          permit a reminder if it remains within its window and
                          owner consent is enabled.
                        </p>
                        <button>Save dose correction</button>
                      </fieldset>
                    </ValidatedForm>
                  )}
                  <h3>Reminder processing history</h3>
                  {!detail.reminders.length && (
                    <p>
                      No reminder job is recorded for this event. It is not
                      evidence of delivery.
                    </p>
                  )}
                  <ul className="records">
                    {detail.reminders.map((j) => (
                      <li key={j.id}>
                        <strong>{jobStatus(j)}</strong>
                        <p>
                          {j.errorCode || "No processing error recorded"} ·
                          Reminder {j.runAtUTC} · Window ends {j.expiresAtUTC}
                        </p>
                        <p>
                          Processing attempts: {j.attemptCount}. Channel
                          acceptance does not confirm receipt or reading.
                        </p>
                        <ol>
                          {j.attempts.map((a) => (
                            <li key={a.attemptNumber}>
                              Attempt {a.attemptNumber}: {a.status} ·{" "}
                              {a.errorCode || "no error"} · {a.attemptedAt}
                              {!a.providerCallAt
                                ? " · no provider call recorded"
                                : ""}
                            </li>
                          ))}
                        </ol>
                        {["failed", "disabled", "suppressed"].includes(
                          j.status,
                        ) && (
                          <button
                            disabled={
                              !owner ||
                              !write ||
                              saving ||
                              !settings?.enabled ||
                              !settings?.configured ||
                              !settings?.channelLinked ||
                              j.attemptCount >= 3
                            }
                            onClick={() =>
                              mutation(
                                `/doses/${detail.dose.id}/reminders/${j.id}/retry`,
                                { expectedRevision: j.revision },
                                {
                                  doseId: detail.dose.id,
                                  message:
                                    "Unsent reminder queued for an explicit retry; dose status is unchanged.",
                                },
                              )
                            }
                          >
                            Retry unsent dose reminder
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                  {detail.nextReminderCursor && (
                    <button
                      disabled={saving || opening}
                      onClick={() => more("reminders")}
                    >
                      More reminder history
                    </button>
                  )}
                </section>
              )}
            </div>
            <aside>
              {meta && (
                <section className="card">
                  <h3>Selected day at a glance</h3>
                  <p>
                    Taken: {meta.summary.taken} · Skipped:{" "}
                    {meta.summary.skipped}
                  </p>
                  <p>
                    Pending: {meta.summary.pending} · Cancelled:{" "}
                    {meta.summary.cancelled}
                  </p>
                  <p>Overdue-unconfirmed: {meta.summary.overdueUnconfirmed}</p>
                  <p>
                    Counts cover the whole selected day, including records
                    beyond this page. Unanswered events are never automatically
                    skipped.
                  </p>
                  <p>
                    Stock totals are not updated by dose recording in this
                    version.
                  </p>
                </section>
              )}
              <section className="card">
                <h3>Owner dose reminders</h3>
                {settingsError && (
                  <div className="alert" role="alert">
                    {settingsError}
                    <button disabled={saving} onClick={loadSettings}>
                      Retry reminder status
                    </button>
                  </div>
                )}
                {settings ? (
                  <>
                    <p>
                      Recipient: this patient’s owner. Reminders default to off;
                      caregiver access does not opt anyone into messages.
                    </p>
                    <p>Preference: {settings.enabled ? "enabled" : "off"}</p>
                    <p>
                      {settings.configured
                        ? settings.channelLinked
                          ? "Private Telegram account linked."
                          : "Owner has no linked private Telegram account. Link it from Caregiver tasks first."
                        : "Telegram is not configured. No real dose-reminder delivery has been verified."}
                    </p>
                    <p>
                      Last dose-worker heartbeat:{" "}
                      {settings.workerLastActiveAt || "not recorded"}. A
                      heartbeat is not proof the worker remains running.
                    </p>
                    {owner ? (
                      <ValidatedForm onSubmit={saveSettings}>
                        <fieldset disabled={!write || saving}>
                          <label className="check">
                            <input
                              type="checkbox"
                              name="enabled"
                              checked={enabled}
                              onChange={(e) => setEnabled(e.target.checked)}
                            />
                            I request generic dose reminders for this patient’s
                            owner through their linked private Telegram account.
                          </label>
                          <p>
                            Requests are processed only while the dose worker
                            runs. Unconfigured requests are recorded as
                            disabled; late requests expire after 60 minutes.
                            Enabling does not automatically resend prior failed
                            or unknown attempts.
                          </p>
                          <button>Save dose reminder preference</button>
                        </fieldset>
                      </ValidatedForm>
                    ) : (
                      <p>
                        Only the owner changes reminder consent or retries
                        notices. Authorized caregivers may record dose actions.
                      </p>
                    )}
                  </>
                ) : (
                  !settingsError && <p>Loading reminder preferences…</p>
                )}
              </section>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
