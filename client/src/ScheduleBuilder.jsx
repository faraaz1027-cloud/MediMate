import { useEffect, useRef, useState } from "react";
import ValidatedForm from "./ValidatedForm.jsx";

const blank = {
  prescriptionInstructionId: "",
  cabinetItemId: "",
  timingMode: "fixed_times",
  timezone: "Asia/Dhaka",
  doseQuantity: "",
  doseUnit: "",
  effectiveFromUTC: "",
  endAtUTC: "",
  localTimes: "",
  intervalMinutes: "",
  anchorAtUTC: "",
  reviewedAgainstSource: false,
};
const display = (utc, zone) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    dateStyle: "medium",
    timeStyle: "short",
    hourCycle: "h23",
  }).format(new Date(utc));

export default function ScheduleBuilder({ api, patient, permissions, onBusy }) {
  const read = permissions.includes("schedule.read"),
    write = permissions.includes("schedule.write"),
    sourcesAllowed =
      write &&
      permissions.includes("prescription.read") &&
      permissions.includes("cabinet.read"),
    base = `/patients/${patient}`;
  const [rows, setRows] = useState([]),
    [cursor, setCursor] = useState(null),
    [loading, setLoading] = useState(false),
    [listError, setListError] = useState("");
  const [detail, setDetail] = useState(null),
    [history, setHistory] = useState([]),
    [events, setEvents] = useState([]),
    [eventCursor, setEventCursor] = useState(null),
    [historyCursor, setHistoryCursor] = useState(null),
    [view, setView] = useState("upcoming"),
    [opening, setOpening] = useState(false);
  const [prescriptions, setPrescriptions] = useState([]),
    [rxCursor, setRxCursor] = useState(null),
    [cabinet, setCabinet] = useState([]),
    [cabCursor, setCabCursor] = useState(null),
    [lines, setLines] = useState([]),
    [source, setSource] = useState(null),
    [sourceBusy, setSourceBusy] = useState(false),
    [sourceError, setSourceError] = useState("");
  const [form, setForm] = useState(blank),
    [editing, setEditing] = useState(false),
    [preview, setPreview] = useState(null),
    [confirmed, setConfirmed] = useState(false),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [resumeAt, setResumeAt] = useState("");
  const alive = useRef(true),
    listEpoch = useRef(0),
    detailEpoch = useRef(0),
    sourceEpoch = useRef(0),
    sourceRequests = useRef(0),
    lock = useRef(false),
    operation = useRef(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      listEpoch.current++;
      detailEpoch.current++;
      sourceEpoch.current++;
    };
  }, [patient]);
  useEffect(() => {
    if (read) reload();
  }, [patient, read]);
  const active = (epoch) => alive.current && epoch === detailEpoch.current;
  async function reload(append = false) {
    const epoch = ++listEpoch.current;
    setLoading(true);
    setListError("");
    try {
      const r = await api(
        base +
          "/schedules?limit=20" +
          (append && cursor ? "&cursor=" + cursor : ""),
        { isCurrent: () => alive.current && epoch === listEpoch.current },
      );
      if (!alive.current || epoch !== listEpoch.current) return;
      setRows((old) => (append ? [...old, ...r.data] : r.data));
      setCursor(r.meta.nextCursor);
    } catch (e) {
      if (alive.current && epoch === listEpoch.current) {
        setListError(e.message);
        if ([403, 404].includes(e.status)) setRows([]);
      }
    } finally {
      if (alive.current && epoch === listEpoch.current) setLoading(false);
    }
  }
  async function open(id, nextView = view) {
    const epoch = ++detailEpoch.current;
    setOpening(true);
    setDetail(null);
    setPreview(null);
    setEditing(false);
    setError("");
    setView(nextView);
    setHistory([]);
    setEvents([]);
    try {
      const opts = { isCurrent: () => active(epoch) },
        [d, h, e] = await Promise.all([
          api(`${base}/schedules/${id}`, opts),
          api(`${base}/schedules/${id}/versions?limit=20`, opts),
          api(
            `${base}/schedules/${id}/occurrences?view=${nextView}&limit=20`,
            opts,
          ),
        ]);
      if (!active(epoch)) return;
      setDetail(d.data);
      setHistory(h.data);
      setHistoryCursor(h.meta.nextCursor);
      setEvents(e.data);
      setEventCursor(e.meta.nextCursor);
      setResumeAt("");
    } catch (e) {
      if (active(epoch)) setError(e.message);
    } finally {
      if (active(epoch)) setOpening(false);
    }
  }
  async function more(kind) {
    const epoch = detailEpoch.current,
      isEvents = kind === "occurrences",
      c = isEvents ? eventCursor : historyCursor;
    setOpening(true);
    try {
      const r = await api(
        `${base}/schedules/${detail.schedule.id}/${kind}?limit=20&cursor=${c}` +
          (isEvents ? `&view=${view}` : ""),
        { isCurrent: () => active(epoch) },
      );
      if (!active(epoch)) return;
      if (isEvents) {
        setEvents((old) => [...old, ...r.data]);
        setEventCursor(r.meta.nextCursor);
      } else {
        setHistory((old) => [...old, ...r.data]);
        setHistoryCursor(r.meta.nextCursor);
      }
    } catch (e) {
      if (active(epoch)) setError(e.message);
    } finally {
      if (active(epoch)) setOpening(false);
    }
  }
  function sourceLoading(delta) {
    sourceRequests.current += delta;
    if (alive.current) setSourceBusy(sourceRequests.current > 0);
  }
  async function sources(kind, append = false) {
    const epoch = sourceEpoch.current;
    sourceLoading(1);
    setSourceError("");
    try {
      const c = kind === "prescriptions" ? rxCursor : cabCursor;
      const r = await api(
        `${base}/${kind}?status=active&limit=20` +
          (append && c ? `&cursor=${c}` : ""),
        { isCurrent: () => alive.current && epoch === sourceEpoch.current },
      );
      if (!alive.current || epoch !== sourceEpoch.current) return;
      if (kind === "prescriptions") {
        setPrescriptions((old) => (append ? [...old, ...r.data] : r.data));
        setRxCursor(r.meta.nextCursor);
      } else {
        setCabinet((old) => (append ? [...old, ...r.data] : r.data));
        setCabCursor(r.meta.nextCursor);
      }
    } catch (e) {
      if (alive.current && epoch === sourceEpoch.current) {
        setSourceError(e.message);
        if ([403, 404].includes(e.status)) {
          setLines([]);
          setSource(null);
          setCabinet([]);
          setPrescriptions([]);
        }
      }
    } finally {
      sourceLoading(-1);
    }
  }
  function start(edit = false) {
    sourceEpoch.current++;
    setSource(null);
    setLines([]);
    setPreview(null);
    setConfirmed(false);
    setError("");
    setNotice("");
    operation.current = null;
    setEditing(true);
    if (!edit) {
      detailEpoch.current++;
      setDetail(null);
    }
    setForm({
      ...blank,
      ...(edit
        ? {
            cabinetItemId: detail.schedule.cabinetItemId,
            doseQuantity: detail.version.doseQuantity,
            doseUnit: detail.version.doseUnit,
            timezone: detail.version.timezone,
            timingMode: detail.version.timingMode,
            localTimes: detail.version.localTimes?.join(", ") || "",
            intervalMinutes: detail.version.intervalMinutes || "",
            anchorAtUTC: detail.version.anchorAtUTC || "",
          }
        : {}),
    });
    sources("prescriptions");
    sources("cabinet-items");
  }
  async function choosePrescription(rxId) {
    const epoch = sourceEpoch.current;
    sourceLoading(1);
    setSourceError("");
    setSource(null);
    setLines([]);
    change("prescriptionInstructionId", "");
    if (!rxId) {
      sourceLoading(-1);
      return;
    }
    try {
      const r = await api(`${base}/prescriptions/${rxId}`, {
        isCurrent: () => alive.current && epoch === sourceEpoch.current,
      });
      if (!alive.current || epoch !== sourceEpoch.current) return;
      setLines(r.data.currentVersion?.instructions || []);
      if (!r.data.currentVersion)
        setSourceError(
          "This prescription has no confirmed version. Confirm it in Prescriptions first.",
        );
    } catch (e) {
      if (alive.current && epoch === sourceEpoch.current)
        setSourceError(e.message);
    } finally {
      sourceLoading(-1);
    }
  }
  function change(key, value) {
    setForm((old) => ({
      ...old,
      [key]: value,
      ...(key === "reviewedAgainstSource"
        ? {}
        : { reviewedAgainstSource: false }),
    }));
    setPreview(null);
    setConfirmed(false);
    operation.current = null;
  }
  function chooseLine(lineId) {
    const line = lines.find((x) => x.id === lineId);
    setSource(line || null);
    setPreview(null);
    setConfirmed(false);
    operation.current = null;
    setForm((old) => ({
      ...old,
      prescriptionInstructionId: lineId,
      doseQuantity: line?.doseQuantity || "",
      doseUnit: line?.doseUnit || "",
      cabinetItemId:
        detail?.schedule.cabinetItemId || line?.cabinetItemId || "",
      reviewedAgainstSource: false,
    }));
  }
  async function run(fn) {
    if (lock.current) return;
    lock.current = true;
    setSaving(true);
    onBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      if (alive.current) {
        setError(e.message);
        if ([403, 404].includes(e.status)) {
          setDetail(null);
          setSource(null);
          setPreview(null);
          setEditing(false);
          setRows([]);
        }
        return { error: e };
      }
    } finally {
      lock.current = false;
      if (alive.current) {
        setSaving(false);
      }
      // Authentication rejection can unmount this editor before finally runs.
      onBusy(false);
    }
  }
  function requestWrite(path, body) {
    const signature = path + JSON.stringify(body);
    if (operation.current?.signature !== signature)
      operation.current = { signature, key: crypto.randomUUID() };
    return api(base + path, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Idempotency-Key": operation.current.key },
      isCurrent: () => alive.current,
    });
  }
  async function makePreview(event) {
    event.preventDefault();
    return run(async () => {
      const { localTimes, intervalMinutes, anchorAtUTC, ...common } = form;
      const body = {
        ...common,
        ...(form.timingMode === "fixed_times"
          ? { localTimes: localTimes.split(",").map((x) => x.trim()) }
          : { intervalMinutes: Number(intervalMinutes), anchorAtUTC }),
        ...(detail
          ? {
              scheduleId: detail.schedule.id,
              expectedRevision: detail.schedule.revision,
            }
          : {}),
      };
      const r = await api(base + "/schedule-previews", {
        method: "POST",
        body: JSON.stringify(body),
        isCurrent: () => alive.current,
      });
      if (alive.current) {
        setPreview(r.data);
        setConfirmed(false);
      }
    });
  }
  async function confirm(event) {
    event.preventDefault();
    return run(async () => {
      const path = detail
        ? `/schedules/${detail.schedule.id}/versions`
        : "/schedules";
      const r = await requestWrite(path, {
        previewToken: preview.previewToken,
        confirmed,
        ...(detail ? { expectedRevision: detail.schedule.revision } : {}),
      });
      if (!alive.current) return;
      operation.current = null;
      await open(r.data.schedule.id);
      await reload();
      setNotice("Schedule confirmed and dose events saved.");
    });
  }
  async function pause() {
    return run(async () => {
      const r = await requestWrite(`/schedules/${detail.schedule.id}/pause`, {
        expectedRevision: detail.schedule.revision,
      });
      if (alive.current) {
        operation.current = null;
        await open(r.data.id);
        await reload();
        setNotice("Paused. Past and acted events are retained.");
      }
    });
  }
  async function resume(event) {
    event.preventDefault();
    return run(async () => {
      const r = await requestWrite(`/schedules/${detail.schedule.id}/resume`, {
        expectedRevision: detail.schedule.revision,
        effectiveFromUTC: resumeAt,
      });
      if (alive.current) {
        operation.current = null;
        await open(r.data.id);
        await reload();
        setNotice(
          "Resumed from the reviewed future time. No past reminders were created.",
        );
      }
    });
  }
  const disabled = saving || sourceBusy;
  return (
    <div className="columns schedule-workspace">
      <section className="card">
        <h2>Medication schedules</h2>
        <p>
          Use confirmed instructions to review a finite course. Schedule events
          do not record a dose as taken or send reminders.
        </p>
        {read ? (
          <>
            <button disabled={saving || loading} onClick={() => reload()}>
              Refresh schedules
            </button>
            {loading && <p role="status">Loading schedules…</p>}
            {listError && (
              <div role="alert" className="alert">
                {listError}
                <button onClick={() => reload()}>Retry schedules</button>
              </div>
            )}
            {!loading && !listError && !rows.length && <p>No schedules yet.</p>}
            <ul className="records">
              {rows.map((row) => (
                <li key={row.id}>
                  <strong>
                    {row.currentVersion.sourceSnapshot.medicineText}
                  </strong>
                  <p>
                    {row.status} · Version {row.currentVersion.versionNumber} ·{" "}
                    {row.currentVersion.timezone}
                  </p>
                  <button disabled={saving} onClick={() => open(row.id)}>
                    View schedule{" "}
                    {row.currentVersion.sourceSnapshot.medicineText}
                  </button>
                </li>
              ))}
            </ul>
            {cursor && (
              <button disabled={saving || loading} onClick={() => reload(true)}>
                More schedules
              </button>
            )}
          </>
        ) : (
          <p>Schedule read permission is required to list saved schedules.</p>
        )}
        <button
          disabled={!sourcesAllowed || saving || opening}
          onClick={() => start()}
        >
          New schedule
        </button>
        {!sourcesAllowed && (
          <p>
            Creating, editing and resuming require schedule.write,
            prescription.read and cabinet.read. Saved schedules need only
            schedule.read.
          </p>
        )}
      </section>
      <section className="card">
        {error && (
          <div className="alert" role="alert">
            {error}
          </div>
        )}
        {notice && (
          <p className="success" role="status">
            {notice}
          </p>
        )}
        {opening && <p role="status">Loading schedule…</p>}
        {detail && !editing && (
          <>
            <h2>{detail.version.sourceSnapshot.medicineText} schedule</h2>
            <p>Schedule status: {detail.schedule.status}</p>
            <p>
              Version {detail.version.versionNumber} · {detail.version.timezone}
            </p>
            <p>
              Strength from A1:{" "}
              {detail.version.sourceSnapshot.strengthText || "Not transcribed"}.
              Quantity per dose: {detail.version.doseQuantity}{" "}
              {detail.version.doseUnit}.
            </p>
            <p>
              {detail.version.timingMode === "fixed_times"
                ? `Local times: ${detail.version.localTimes.join(", ")}`
                : `Every ${detail.version.intervalMinutes} elapsed minutes; anchor ${detail.version.anchorAtUTC}`}
            </p>
            <p>
              Course: {detail.version.effectiveFromUTC} to{" "}
              {detail.version.endAtUTC} (end excluded).
            </p>
            <p>
              Confirmed source: {detail.version.sourceSnapshot.frequencyText} ·{" "}
              {detail.version.sourceSnapshot.durationText}
            </p>
            <button
              disabled={!sourcesAllowed || saving}
              onClick={() => start(true)}
            >
              Edit future schedule
            </button>
            {detail.schedule.status === "active" ? (
              <button disabled={!write || saving} onClick={pause}>
                Pause schedule
              </button>
            ) : (
              <ValidatedForm onSubmit={resume}>
                <fieldset disabled={!sourcesAllowed || saving}>
                  <legend>Resume future events</legend>
                  <label>
                    Resume from UTC
                    <input
                      name="effectiveFromUTC"
                      required
                      placeholder="2026-11-03T00:00:00Z"
                      value={resumeAt}
                      onChange={(e) => setResumeAt(e.target.value)}
                    />
                  </label>
                  <p>
                    Use a time at or after this version's start, before its
                    original end. If the source changed, use Edit future
                    schedule to preview a replacement.
                  </p>
                  <button>Resume schedule</button>
                </fieldset>
              </ValidatedForm>
            )}
            <label>
              Dose event view
              <select
                disabled={saving || opening}
                value={view}
                onChange={(e) => open(detail.schedule.id, e.target.value)}
              >
                <option value="upcoming">Upcoming seven days</option>
                <option value="history">
                  All persisted events and history
                </option>
              </select>
            </label>
            {!events.length && <p>No events in this view.</p>}
            <ul className="records">
              {events.map((e) => (
                <li key={e.id}>
                  <strong>
                    {display(e.dueAtUTC, e.timezoneSnapshot)} ·{" "}
                    {e.doseQuantitySnapshot} {e.doseUnitSnapshot}
                  </strong>
                  <p>
                    {e.state}
                    {e.cancellationReason ? ` · ${e.cancellationReason}` : ""}
                  </p>
                  <small>
                    {e.timezoneSnapshot} · {e.dueAtUTC} · Version ID{" "}
                    {e.scheduleVersionId}
                  </small>
                </li>
              ))}
            </ul>
            {eventCursor && (
              <button
                disabled={opening || saving}
                onClick={() => more("occurrences")}
              >
                More dose events
              </button>
            )}
            <h3>Immutable schedule versions</h3>
            <ul className="records">
              {history.map((v) => (
                <li key={v.id}>
                  <strong>Schedule version {v.versionNumber}</strong>
                  <p>
                    {v.doseQuantity} {v.doseUnit} · {v.timezone} ·{" "}
                    {v.timingMode === "fixed_times"
                      ? v.localTimes.join(", ")
                      : `Every ${v.intervalMinutes} minutes`}
                  </p>
                  <p>
                    {v.effectiveFromUTC} → {v.endAtUTC}
                  </p>
                  <small>
                    Confirmed {v.confirmedAt} · source instruction{" "}
                    {v.prescriptionInstructionId}
                  </small>
                </li>
              ))}
            </ul>
            {historyCursor && (
              <button
                disabled={opening || saving}
                onClick={() => more("versions")}
              >
                More schedule versions
              </button>
            )}
          </>
        )}
        {editing && (
          <>
            <h2>{detail ? "Replace future schedule" : "Build a schedule"}</h2>
            <p>
              Choose the current confirmed A1 line. Clarify unclear, conditional
              or as-needed instructions with the responsible person first. Do
              not infer timing from strength or OCR.
            </p>
            {sourceError && (
              <div className="alert" role="alert">
                {sourceError}
                <button
                  disabled={disabled}
                  onClick={() => {
                    sources("prescriptions");
                    sources("cabinet-items");
                  }}
                >
                  Retry source lists
                </button>
              </div>
            )}
            {sourceBusy && <p role="status">Loading confirmed sources…</p>}
            <label>
              Source prescription
              <select
                disabled={disabled}
                defaultValue=""
                onChange={(e) => choosePrescription(e.target.value)}
              >
                <option value="">Choose prescription</option>
                {prescriptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title || p.id}
                    {p.currentVersionId ? " · confirmed" : " · draft only"}
                  </option>
                ))}
              </select>
            </label>
            {rxCursor && (
              <button
                disabled={disabled}
                onClick={() => sources("prescriptions", true)}
              >
                More source prescriptions
              </button>
            )}
            <ValidatedForm onSubmit={makePreview}>
              <fieldset disabled={disabled}>
                <legend>Schedule details</legend>
                <label>
                  Confirmed instruction
                  <select
                    name="prescriptionInstructionId"
                    required
                    value={form.prescriptionInstructionId}
                    onChange={(e) => chooseLine(e.target.value)}
                  >
                    <option value="">Choose confirmed instruction</option>
                    {lines.map((l) => (
                      <option
                        key={l.id}
                        value={l.id}
                        disabled={l.clarificationRequired}
                      >
                        {l.lineNumber}. {l.medicineText}
                      </option>
                    ))}
                  </select>
                </label>
                {source && (
                  <div className="source-summary">
                    <p>Source medicine: {source.medicineText}</p>
                    <p>
                      Source strength:{" "}
                      {source.strengthText || "Not transcribed"}
                    </p>
                    <p>
                      Source quantity: {source.doseQuantity || "Missing"}{" "}
                      {source.doseUnit}
                    </p>
                    <p>Source timing: {source.frequencyText || "Missing"}</p>
                    <p>Source duration: {source.durationText || "Missing"}</p>
                    <p>{source.instructionsText}</p>
                  </div>
                )}
                <label>
                  Saved medicine
                  <select
                    name="cabinetItemId"
                    required
                    value={form.cabinetItemId}
                    disabled={disabled || !!detail}
                    onChange={(e) => change("cabinetItemId", e.target.value)}
                  >
                    <option value="">Choose active saved medicine</option>
                    {!cabinet.some((c) => c.id === form.cabinetItemId) &&
                      form.cabinetItemId && (
                        <option value={form.cabinetItemId}>
                          Referenced medicine (load more or check cabinet)
                        </option>
                      )}
                    {cabinet.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.displayName} ·{" "}
                        {c.strengthText || "strength not transcribed"}
                      </option>
                    ))}
                  </select>
                </label>
                {cabCursor && (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => sources("cabinet-items", true)}
                  >
                    More saved medicines
                  </button>
                )}
                <p>
                  Choose the correct product yourself; the app does not
                  clinically match medicine names or strengths.
                </p>
                <label>
                  Quantity per dose
                  <input
                    name="doseQuantity"
                    required
                    readOnly
                    value={form.doseQuantity}
                  />
                </label>
                <label>
                  Dose unit
                  <input
                    name="doseUnit"
                    required
                    readOnly
                    value={form.doseUnit}
                  />
                </label>
                <label>
                  Timezone
                  <input
                    name="timezone"
                    required
                    value={form.timezone}
                    onChange={(e) => change("timezone", e.target.value)}
                    placeholder="Asia/Dhaka"
                  />
                </label>
                <label>
                  Timing mode
                  <select
                    name="timingMode"
                    value={form.timingMode}
                    onChange={(e) => change("timingMode", e.target.value)}
                  >
                    <option value="fixed_times">Fixed local clock times</option>
                    <option value="interval">
                      Elapsed interval from UTC anchor
                    </option>
                  </select>
                </label>
                {form.timingMode === "fixed_times" ? (
                  <label>
                    Local times (HH:mm, comma separated)
                    <input
                      name="localTimes"
                      required
                      value={form.localTimes}
                      onChange={(e) => change("localTimes", e.target.value)}
                      placeholder="08:00, 20:00"
                    />
                  </label>
                ) : (
                  <>
                    <label>
                      Interval in minutes
                      <input
                        name="intervalMinutes"
                        type="number"
                        min="1"
                        step="1"
                        required
                        value={form.intervalMinutes}
                        onChange={(e) =>
                          change("intervalMinutes", e.target.value)
                        }
                      />
                    </label>
                    <label>
                      Interval anchor UTC
                      <input
                        name="anchorAtUTC"
                        required
                        value={form.anchorAtUTC}
                        onChange={(e) => change("anchorAtUTC", e.target.value)}
                        placeholder="2026-11-03T00:00:00Z"
                      />
                    </label>
                  </>
                )}
                <label>
                  Effective start UTC
                  <input
                    name="effectiveFromUTC"
                    required
                    value={form.effectiveFromUTC}
                    onChange={(e) => change("effectiveFromUTC", e.target.value)}
                    placeholder="2026-11-03T00:00:00Z"
                  />
                </label>
                <label>
                  Exclusive end UTC
                  <input
                    name="endAtUTC"
                    required
                    value={form.endAtUTC}
                    onChange={(e) => change("endAtUTC", e.target.value)}
                    placeholder="2026-11-10T00:00:00Z"
                  />
                </label>
                <p>
                  Enter explicit timestamps ending in Z; preview shows local
                  times. Maximum 90 elapsed days and 2000 events. Clock changes
                  that create an ambiguous or missing local time are rejected.
                </p>
                <label className="check">
                  <input
                    name="reviewedAgainstSource"
                    type="checkbox"
                    required
                    checked={form.reviewedAgainstSource}
                    onChange={(e) =>
                      change("reviewedAgainstSource", e.target.checked)
                    }
                  />
                  I checked the medicine, dose, timing, duration and timezone
                  against the confirmed source; no ambiguity remains.
                </label>
                <button>Preview schedule</button>
              </fieldset>
            </ValidatedForm>
            {preview && (
              <div className="schedule-preview">
                <h3>Review schedule preview</h3>
                <p>
                  {preview.occurrenceCount} events ·{" "}
                  {preview.input.doseQuantity} {preview.input.doseUnit} per dose
                  · {preview.input.timezone}
                </p>
                <p>
                  Preview expires {preview.expiresAt}. Full course:{" "}
                  {preview.input.effectiveFromUTC} → {preview.input.endAtUTC}.
                </p>
                {preview.warnings.map((w) => (
                  <p key={w}>{w}</p>
                ))}
                <ol>
                  {preview.occurrences.map((utc) => (
                    <li key={utc}>
                      {display(utc, preview.input.timezone)}
                      <small> · {utc}</small>
                    </li>
                  ))}
                </ol>
                <ValidatedForm onSubmit={confirm}>
                  <fieldset disabled={saving}>
                    <label className="check">
                      <input
                        name="confirmed"
                        type="checkbox"
                        required
                        checked={confirmed}
                        onChange={(e) => setConfirmed(e.target.checked)}
                      />
                      I confirm these dose events and the source review.
                    </label>
                    <button>Confirm schedule version</button>
                  </fieldset>
                </ValidatedForm>
              </div>
            )}
            <button
              className="link"
              disabled={saving}
              onClick={() => {
                setEditing(false);
                setPreview(null);
                setSource(null);
                sourceEpoch.current++;
              }}
            >
              Cancel schedule changes
            </button>
          </>
        )}
        {!editing && !detail && !opening && (
          <p>
            Select a schedule to see its source, versions and persisted dose
            events.
          </p>
        )}
      </section>
    </div>
  );
}
