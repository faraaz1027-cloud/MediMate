import { useEffect, useRef, useState } from "react";
import ValidatedForm from "./ValidatedForm.jsx";
import { PharmacyListing } from "./PharmacyCoordination.jsx";
const deliveryLabels = {
  pending: "Queued",
  processing: "Sending",
  sent: "Accepted by Telegram",
  accepted_by_channel: "Accepted by Telegram",
  failed: "Failed",
  unknown: "Outcome unknown",
  disabled: "Not configured",
  suppressed: "Not sent",
  attempted: "Started",
};
const deliveryReasons = {
  NOT_CONFIGURED: "Telegram is not configured.",
  NOT_LINKED: "The assignee needs an active Telegram link.",
  ACCESS_REVOKED: "The recipient no longer has task access.",
  TASK_CHANGED: "The assignment or task status changed.",
  ALREADY_ACKNOWLEDGED: "The assignee already acknowledged this task.",
  RATE_LIMITED: "Telegram asked us to wait. Retry later.",
  RECIPIENT_BLOCKED: "The bot cannot send to this recipient.",
  PROVIDER_REJECTED: "Telegram rejected the notice.",
  OUTCOME_UNKNOWN:
    "Telegram receipt could not be determined. No automatic resend.",
  RESPONSE_INVALID:
    "Telegram receipt could not be verified. No automatic resend.",
  WORKER_INTERRUPTED: "Delivery was interrupted; receipt is unknown.",
};
const localDate = (value) => {
  if (!value) return "";
  const d = new Date(value);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};
export default function TaskBoard({
  api,
  patient,
  permissions,
  userId,
  owner,
  onBusy,
}) {
  const read = permissions.includes("task.read"),
    write = permissions.includes("task.write"),
    base = `/patients/${patient}`;
  const [rows, setRows] = useState([]),
    [cursor, setCursor] = useState(null),
    [filter, setFilter] = useState({ status: "", mine: false }),
    [loading, setLoading] = useState(false),
    [listError, setListError] = useState("");
  const [selected, setSelected] = useState(null),
    [detail, setDetail] = useState(null),
    [history, setHistory] = useState([]),
    [historyCursor, setHistoryCursor] = useState(null),
    [notices, setNotices] = useState([]),
    [noticeCursor, setNoticeCursor] = useState(null),
    [assignees, setAssignees] = useState([]);
  const [title, setTitle] = useState(""),
    [description, setDescription] = useState(""),
    [assignee, setAssignee] = useState(""),
    [type, setType] = useState("general"),
    [due, setDue] = useState(""),
    [initialNote, setInitialNote] = useState(""),
    [note, setNote] = useState("");
  const [channels, setChannels] = useState(null),
    [challengeUrl, setChallengeUrl] = useState(""),
    [consent, setConsent] = useState(false),
    [channelError, setChannelError] = useState("");
  const [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const alive = useRef(true),
    listEpoch = useRef(0),
    detailEpoch = useRef(0),
    channelEpoch = useRef(0),
    lock = useRef(false),
    pending = useRef(null);
  useEffect(() => {
    alive.current = true;
    if (write)
      api(base + "/task-assignees", { isCurrent: () => alive.current })
        .then((r) => {
          if (alive.current) setAssignees(r.data);
        })
        .catch(() => {});
    refreshChannels();
    return () => {
      alive.current = false;
      listEpoch.current++;
      detailEpoch.current++;
      channelEpoch.current++;
    };
  }, [patient, read, write]);
  useEffect(() => {
    if (read) reload();
  }, [patient, read, write, filter]);
  async function reload(append = false) {
    const epoch = ++listEpoch.current;
    setLoading(true);
    setListError("");
    const qs = new URLSearchParams({
      limit: "20",
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.mine ? { assigneeUserId: "me" } : {}),
    });
    if (append && cursor) qs.set("cursor", cursor);
    try {
      const r = await api(base + "/tasks?" + qs, {
        isCurrent: () => alive.current && epoch === listEpoch.current,
      });
      if (!alive.current || epoch !== listEpoch.current) return;
      setRows((old) => (append ? [...old, ...r.data] : r.data));
      setCursor(r.meta.nextCursor);
    } catch (e) {
      if (alive.current && epoch === listEpoch.current) {
        setListError(e.message);
        if ([403, 404].includes(e.status)) {
          setRows([]);
          setCursor(null);
        }
      }
    } finally {
      if (alive.current && epoch === listEpoch.current) setLoading(false);
    }
  }
  async function open(taskId) {
    const epoch = ++detailEpoch.current,
      opts = {
        isCurrent: () => alive.current && epoch === detailEpoch.current,
      };
    setSelected(taskId);
    setDetail(null);
    setHistory([]);
    setNotices([]);
    setError("");
    try {
      const [d, h, n] = await Promise.all([
        api(base + `/tasks/${taskId}`, opts),
        api(base + `/tasks/${taskId}/history?limit=20`, opts),
        api(base + `/tasks/${taskId}/notifications?limit=20`, opts),
      ]);
      if (!opts.isCurrent()) return;
      setDetail(d.data);
      setHistory(h.data);
      setHistoryCursor(h.meta.nextCursor);
      setNotices(n.data);
      setNoticeCursor(n.meta.nextCursor);
      setTitle(d.data.title);
      setDescription(d.data.description || "");
      setAssignee(d.data.assigneeUserId);
      setType(d.data.type);
      setDue(localDate(d.data.dueAtUTC));
      setNote("");
    } catch (e) {
      if (opts.isCurrent()) setError(e.message);
    }
  }
  function fresh() {
    detailEpoch.current++;
    setSelected(null);
    setDetail(null);
    setHistory([]);
    setNotices([]);
    setTitle("");
    setDescription("");
    setAssignee("");
    setType("general");
    setDue("");
    setInitialNote("");
    setNote("");
    setError("");
    setNotice("");
  }
  async function perform(path, method, body, after) {
    if (lock.current) return;
    lock.current = true;
    setSaving(true);
    onBusy(true);
    setError("");
    setNotice("");
    const payload = JSON.stringify(body);
    if (pending.current?.path !== path || pending.current?.payload !== payload)
      pending.current = { path, payload, key: crypto.randomUUID() };
    try {
      const r = await api(path, {
        method,
        body: payload,
        headers: { "Idempotency-Key": pending.current.key },
        isCurrent: () => alive.current,
      });
      pending.current = null;
      if (!alive.current) return;
      await after?.(r.data);
      if (alive.current) setNotice("Saved to the database.");
    } catch (e) {
      if (alive.current)
        setError(
          e.message +
            " Entries are retained; retry unchanged input with the same key.",
        );
      return { error: e };
    } finally {
      lock.current = false;
      if (alive.current) setSaving(false);
      onBusy(false);
    }
  }
  async function updated(data) {
    if (read) {
      await reload();
      await open(data.id);
    } else fresh();
  }
  function save(e) {
    e.preventDefault();
    const fields = {
      title,
      ...(description || selected ? { description } : {}),
      assigneeUserId: assignee || userId,
      ...(due
        ? { dueAtUTC: new Date(due).toISOString() }
        : selected
          ? { dueAtUTC: null }
          : {}),
    };
    return perform(
      base + "/tasks" + (selected ? "/" + selected : ""),
      selected ? "PATCH" : "POST",
      selected
        ? { ...fields, expectedRevision: detail.revision }
        : {
            ...fields,
            type,
            ...(initialNote ? { handoverNote: initialNote } : {}),
          },
      updated,
    );
  }
  async function more(kind) {
    const epoch = detailEpoch.current,
      path = kind === "history" ? "history" : "notifications",
      c = kind === "history" ? historyCursor : noticeCursor;
    try {
      const r = await api(
        base +
          `/tasks/${selected}/${path}?limit=20&cursor=` +
          encodeURIComponent(c),
        { isCurrent: () => alive.current && epoch === detailEpoch.current },
      );
      if (!alive.current || epoch !== detailEpoch.current) return;
      if (kind === "history") {
        setHistory((old) => [...old, ...r.data]);
        setHistoryCursor(r.meta.nextCursor);
      } else {
        setNotices((old) => [...old, ...r.data]);
        setNoticeCursor(r.meta.nextCursor);
      }
    } catch (e) {
      if (alive.current && epoch === detailEpoch.current) setError(e.message);
    }
  }
  async function refreshChannels() {
    const epoch = ++channelEpoch.current;
    setChannelError("");
    try {
      const r = await api("/me/channel-links", {
        isCurrent: () => alive.current && epoch === channelEpoch.current,
      });
      if (alive.current && epoch === channelEpoch.current) setChannels(r.data);
    } catch (e) {
      if (alive.current && epoch === channelEpoch.current)
        setChannelError(e.message);
    }
  }
  const active = detail && ["open", "accepted"].includes(detail.status),
    manager = owner || detail?.createdByUserId === userId,
    assigned = detail?.assigneeUserId === userId,
    editable = write && (!selected || (manager && active)),
    participant = manager || assigned;
  return (
    <div className="task-workspace">
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="success" role="status">
          {notice}
        </p>
      )}
      <div className="columns">
        <section className="card">
          <div className="section-title">
            <h2>{selected ? "Task details" : "Create caregiver task"}</h2>
            {write && (
              <button className="link" disabled={saving} onClick={fresh}>
                New task
              </button>
            )}
          </div>
          {!write && (
            <p>You do not have permission to create records in this area.</p>
          )}
          {selected && !detail ? (
            <>
              <p role="status">Loading task…</p>
              <button disabled={saving} onClick={() => open(selected)}>
                Retry task details
              </button>
            </>
          ) : (
            <>
              {detail && (
                <>
                  <p className="badge">Task status: {detail.status}</p>
                  {detail.refillListId && (
                    <p>Linked refill checklist · {detail.refillListId}. Ask the patient owner for pickup details.</p>
                  )}
                  {detail.pharmacySnapshot && (
                    <section>
                      <h3>Saved collection location</h3>
                      <PharmacyListing listing={detail.pharmacySnapshot} retrievedAt={detail.pharmacySnapshot.retrievedAt} />
                      <p>Confirm current hours and availability directly.</p>
                      <p><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a></p>
                    </section>
                  )}
                  <p>
                    Assignee:{" "}
                    {assignees.find((a) => a.id === detail.assigneeUserId)
                      ?.displayName || detail.assigneeUserId}
                  </p>
                  <p>
                    {detail.acknowledgedAt
                      ? `Acknowledged in the app at ${new Date(detail.acknowledgedAt).toLocaleString()}`
                      : "Not acknowledged by the assignee in the app."}
                  </p>
                </>
              )}
              <ValidatedForm onSubmit={save}>
                <fieldset disabled={saving || !editable}>
                  <label>
                    Task title
                    <input
                      name="title"
                      required
                      maxLength={200}
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                    />
                  </label>
                  <label>
                    Description (optional)
                    <textarea
                      name="description"
                      maxLength={2000}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                    />
                  </label>
                  <label>
                    Assign to user ID
                    <input
                      name="assigneeUserId"
                      pattern="[a-fA-F0-9]{24}"
                      list="task-assignee-options"
                      placeholder={userId}
                      value={assignee}
                      onChange={(e) => setAssignee(e.target.value)}
                    />
                  </label>
                  <datalist id="task-assignee-options">
                    {assignees.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.displayName}
                      </option>
                    ))}
                  </datalist>
                  <p className="hint">
                    Leave blank to assign to yourself. Another assignee needs
                    active task.read and task.write access. Account and access
                    manages grants.
                  </p>
                  {!selected && (
                    <label>
                      Type
                      <select
                        name="type"
                        value={type}
                        onChange={(e) => setType(e.target.value)}
                      >
                        <option value="general">General</option>
                        <option value="refill">Refill</option>
                      </select>
                    </label>
                  )}
                  <label>
                    Due (your device local time, optional)
                    <input
                      name="dueAtUTC"
                      type="datetime-local"
                      value={due}
                      onChange={(e) => setDue(e.target.value)}
                    />
                  </label>
                  {!selected && (
                    <label>
                      Handover note (optional)
                      <textarea
                        name="handoverNote"
                        maxLength={2000}
                        value={initialNote}
                        onChange={(e) => setInitialNote(e.target.value)}
                      />
                    </label>
                  )}
                  <button>
                    {saving
                      ? "Saving…"
                      : selected
                        ? "Save task changes"
                        : "Save task"}
                  </button>
                </fieldset>
              </ValidatedForm>
              {detail && (
                <>
                  <button disabled={saving} onClick={() => open(selected)}>
                    Reload task
                  </button>
                  {write && (owner || assigned) && detail.status === "open" && (
                    <button
                      disabled={saving}
                      onClick={() =>
                        perform(
                          base + `/tasks/${selected}/transitions`,
                          "POST",
                          {
                            expectedRevision: detail.revision,
                            action: "accept",
                          },
                          updated,
                        )
                      }
                    >
                      Accept task
                    </button>
                  )}
                  {write &&
                    (owner || assigned) &&
                    detail.status === "accepted" && (
                      <button
                        disabled={saving}
                        onClick={() =>
                          perform(
                            base + `/tasks/${selected}/transitions`,
                            "POST",
                            {
                              expectedRevision: detail.revision,
                              action: "complete",
                            },
                            updated,
                          )
                        }
                      >
                        Complete task
                      </button>
                    )}
                  {write && manager && detail.status === "completed" && (
                    <button
                      disabled={saving}
                      onClick={() =>
                        perform(
                          base + `/tasks/${selected}/transitions`,
                          "POST",
                          {
                            expectedRevision: detail.revision,
                            action: "reopen",
                          },
                          updated,
                        )
                      }
                    >
                      Reopen task
                    </button>
                  )}
                  {write && assigned && active && !detail.acknowledgedAt && (
                    <button
                      disabled={saving}
                      onClick={() =>
                        perform(
                          base + `/tasks/${selected}/acknowledgements`,
                          "POST",
                          { expectedRevision: detail.revision },
                          updated,
                        )
                      }
                    >
                      Acknowledge task notice
                    </button>
                  )}
                  {write && participant && (
                    <ValidatedForm
                      onSubmit={(e) => {
                        e.preventDefault();
                        return perform(
                          base + `/tasks/${selected}/notes`,
                          "POST",
                          { text: note },
                          () => open(selected),
                        );
                      }}
                    >
                      <fieldset disabled={saving}>
                        <label>
                          New handover note
                          <textarea
                            name="text"
                            required
                            maxLength={2000}
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                          />
                        </label>
                        <button>Add handover note</button>
                      </fieldset>
                    </ValidatedForm>
                  )}
                  <h3>Status and handover history</h3>
                  <ol>
                    {history.map((h) => (
                      <li key={h.id}>
                        <strong>{h.eventType}</strong>
                        {h.fromStatus && (
                          <p>
                            {h.fromStatus} → {h.toStatus}
                          </p>
                        )}
                        {h.text && <p>{h.text}</p>}
                        {h.snapshot && (
                          <p>
                            Snapshot: {h.snapshot.title} · {h.snapshot.status} ·
                            assignee {h.snapshot.assigneeUserId}
                          </p>
                        )}
                        <small>
                          {new Date(
                            h.occurredAt || h.createdAt,
                          ).toLocaleString()}{" "}
                          · actor {h.actorUserId}
                        </small>
                      </li>
                    ))}
                  </ol>
                  {historyCursor && (
                    <button disabled={saving} onClick={() => more("history")}>
                      More task history
                    </button>
                  )}
                  <h3>Telegram delivery attempts</h3>
                  <p className="hint">
                    Sent means accepted by Telegram, not read or acknowledged.
                    Unknown outcomes are not resent automatically.
                    Acknowledgement above is a separate action in MediMate.
                  </p>
                  {!notices.length && (
                    <p>No notification jobs recorded for this earlier task.</p>
                  )}
                  <ul>
                    {notices.map((n) => (
                      <li key={n.id}>
                        <strong>
                          Notice: {deliveryLabels[n.status] || n.status}
                        </strong>
                        {n.errorCode && (
                          <p>
                            {deliveryReasons[n.errorCode] ||
                              "Delivery unavailable. Refresh its status."}
                          </p>
                        )}
                        <p>
                          Attempts: {n.attemptCount} · assignment {n.generation}
                        </p>
                        <ol>
                          {n.attempts.map((a) => (
                            <li key={a.id}>
                              Attempt {a.attemptNumber}:{" "}
                              {deliveryLabels[a.status] || a.status}
                              {a.errorCode
                                ? ` · ${deliveryReasons[a.errorCode] || "Delivery unavailable"}`
                                : ""}
                            </li>
                          ))}
                        </ol>
                        {write &&
                          participant &&
                          active &&
                          !detail.acknowledgedAt &&
                          ["failed", "disabled", "suppressed"].includes(
                            n.status,
                          ) &&
                          n.attemptCount < 3 &&
                          channels?.configured &&
                          n.generation === (detail.assignmentGeneration || 0) &&
                          n.recipientId === detail.assigneeUserId && (
                            <button
                              disabled={saving}
                              onClick={() =>
                                perform(
                                  base +
                                    `/tasks/${selected}/notifications/${n.id}/retry`,
                                  "POST",
                                  {},
                                  () => open(selected),
                                )
                              }
                            >
                              Retry unsent notice
                            </button>
                          )}
                      </li>
                    ))}
                  </ul>
                  {noticeCursor && (
                    <button disabled={saving} onClick={() => more("notices")}>
                      More notice history
                    </button>
                  )}
                </>
              )}
            </>
          )}
        </section>
        <section className="card records" aria-busy={loading}>
          <div className="section-title">
            <h2>Saved records</h2>
            <button
              className="link"
              disabled={loading || saving || !read}
              onClick={() => reload()}
            >
              Refresh
            </button>
          </div>
          {!read ? (
            <p>
              You do not have permission to view saved records in this area.
            </p>
          ) : (
            <>
              <label>
                Task status filter
                <select
                  disabled={saving}
                  value={filter.status}
                  onChange={(e) => {
                    listEpoch.current++;
                    setRows([]);
                    setCursor(null);
                    setFilter({ ...filter, status: e.target.value });
                  }}
                >
                  <option value="">All statuses</option>
                  <option value="open">Open</option>
                  <option value="accepted">Accepted</option>
                  <option value="completed">Completed</option>
                </select>
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={filter.mine}
                  disabled={saving}
                  onChange={(e) => {
                    listEpoch.current++;
                    setRows([]);
                    setCursor(null);
                    setFilter({ ...filter, mine: e.target.checked });
                  }}
                />
                Assigned to me
              </label>
              {loading && <p role="status">Loading records…</p>}
              {listError && (
                <div className="alert" role="alert">
                  <p>{listError}</p>
                  <button disabled={saving || loading} onClick={() => reload()}>
                    Retry loading records
                  </button>
                </div>
              )}
              {!loading && !listError && !rows.length && <p>No records yet.</p>}
              <ul>
                {rows.map((r) => (
                  <li key={r.id}>
                    <strong>{r.title}</strong>
                    <p>
                      {r.status} · {r.type}
                    </p>
                    {r.dueAtUTC && (
                      <p>Due: {new Date(r.dueAtUTC).toLocaleString()}</p>
                    )}
                    <button disabled={saving} onClick={() => open(r.id)}>
                      View task {r.title}
                    </button>
                  </li>
                ))}
              </ul>
              {cursor && (
                <button
                  disabled={saving || loading}
                  onClick={() => reload(true)}
                >
                  Load more
                </button>
              )}
            </>
          )}
        </section>
      </div>
      <section className="card channel-linking">
        <h2>Your Telegram task notices</h2>
        <p>
          Link only your own private Telegram chat. The bot sends a generic task
          notice without patient names, medicine details or handover text.
          Linking does not grant access to any patient.
        </p>
        {channelError && (
          <p className="alert" role="alert">
            {channelError}
          </p>
        )}
        <button disabled={saving} onClick={refreshChannels}>
          Refresh Telegram status
        </button>
        {!channels ? (
          <p>Loading Telegram configuration…</p>
        ) : (
          <>
            {!channels.configured && (
              <p>
                Telegram is not configured. Tasks and handover work without it;
                no Telegram delivery has been verified.
              </p>
            )}
            {channels.configured && (
              <p>
                Bot: @{channels.botUsername}. Delivery service last active:{" "}
                {channels.workerLastActiveAt
                  ? new Date(channels.workerLastActiveAt).toLocaleString()
                  : "No heartbeat recorded; queued notices need the worker running."}
              </p>
            )}
            {channels.links.map((l) => (
              <div key={l.id}>
                <p>
                  Linked private account {l.accountHint} · consented{" "}
                  {new Date(l.consentedAt).toLocaleString()}
                </p>
                <button
                  disabled={saving}
                  onClick={() =>
                    perform(
                      `/me/channel-links/${l.id}`,
                      "DELETE",
                      {},
                      async () => {
                        setChallengeUrl("");
                        setConsent(false);
                        await refreshChannels();
                      },
                    )
                  }
                >
                  Unlink Telegram
                </button>
              </div>
            ))}
            {!channels.links.length && (
              <button
                disabled={saving || !channels.configured}
                onClick={() =>
                  perform(
                    "/me/channel-link-challenges",
                    "POST",
                    { provider: "telegram" },
                    async (data) => {
                      setChallengeUrl(data.challengeUrl || "");
                      setConsent(false);
                      await refreshChannels();
                      if (!data.challengeUrl)
                        setError(
                          "The challenge was already created. Its private URL is shown once; generate a new challenge if you lost it.",
                        );
                    },
                  )
                }
              >
                Generate Telegram linking code
              </button>
            )}
            {challengeUrl && (
              <p>
                <a href={challengeUrl} target="_blank" rel="noreferrer">
                  Open your bot and press Start
                </a>
                . This link expires in 10 minutes. Keep it private, then refresh
                status here.
              </p>
            )}
            {channels.challenges.map((c) => (
              <div key={c.id}>
                <p>
                  Link challenge: {c.status} · expires{" "}
                  {new Date(c.expiresAt).toLocaleString()}
                  {c.accountHint ? ` · private account ${c.accountHint}` : ""}
                </p>
                {c.status === "proposed" && !channels.links.length && (
                  <>
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={consent}
                        disabled={saving}
                        onChange={(e) => setConsent(e.target.checked)}
                      />
                      I started this private bot chat and consent to generic
                      task notices
                    </label>
                    <button
                      disabled={saving || !consent}
                      onClick={() =>
                        perform(
                          `/me/channel-link-challenges/${c.id}/confirm`,
                          "POST",
                          { expectedRevision: c.revision, consent: true },
                          async () => {
                            setChallengeUrl("");
                            setConsent(false);
                            await refreshChannels();
                          },
                        )
                      }
                    >
                      Confirm Telegram link
                    </button>
                  </>
                )}
              </div>
            ))}
          </>
        )}
      </section>
    </div>
  );
}
