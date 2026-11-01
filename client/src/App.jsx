import PrescriptionReview from "./PrescriptionReview.jsx";
import { useEffect, useRef, useState } from "react";
import "./App.css";
import AccountAccess from "./AccountAccess.jsx";
import ValidatedForm from "./ValidatedForm.jsx";
import { request } from "./request.js";
const tabs = [
  ["prescriptions", "Prescriptions"],
  ["cabinet-items", "Medicine cabinet"],
  ["tasks", "Caregiver tasks"],
];
export default function App() {
  const [user, setUser] = useState(null),
    [csrf, setCsrf] = useState(""),
    [ready, setReady] = useState(false),
    [connectionAttempt, setConnectionAttempt] = useState(0),
    [connectionFailed, setConnectionFailed] = useState(false),
    [showAccount, setShowAccount] = useState(false),
    [register, setRegister] = useState(false),
    [patient, setPatient] = useState(""),
    [tab, setTab] = useState("prescriptions"),
    [rows, setRows] = useState([]),
    [rowsView, setRowsView] = useState(""),
    [cursor, setCursor] = useState(null),
    [loading, setLoading] = useState(false),
    [listError, setListError] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const generation = useRef(0),
    pending = useRef(null),
    lock = useRef(false), currentView = useRef("");
  const selectedPatient = user?.patients?.find((p) => p.id === patient);
  const prefixes = { prescriptions: "prescription", "cabinet-items": "cabinet", tasks: "task" };
  const visibleTabs = tabs.filter(([id]) => selectedPatient?.permissions?.some((p) => p === prefixes[id] + ".read" || p === prefixes[id] + ".write"));
  const activeTab = visibleTabs.some(([id]) => id === tab) ? tab : visibleTabs[0]?.[0] || tab;
  const permissionPrefix = prefixes[activeTab];
  const canWrite = selectedPatient?.permissions?.includes(permissionPrefix + ".write");
  const canRead = selectedPatient?.permissions?.includes(permissionPrefix + ".read");
  const view = `${user?.id}/${patient}/${activeTab}`;
  currentView.current = view;
  const visibleRows = canRead && rowsView === view ? rows : [];
  async function api(path, options = {}) {
    const { isCurrent = () => true, ...fetchOptions } = options;
    try { return await request(path, {
      ...fetchOptions,
      headers: {
        "Content-Type": "application/json",
        ...(options.method ? { "X-CSRF-Token": csrf } : {}),
        ...options.headers,
      },
    }); } catch (e) {
      if (!isCurrent()) throw e;
      if (e.status === 401) {
        generation.current++;
        setUser(null);
        setPatient("");
        setRows([]);
        setCursor(null);
        setLoading(false);
        setNotice("");
        pending.current = null;
      }
      if (e.status === 401 || e.code === "CSRF_REJECTED") {
        // A rejected write has not run. Recover credentials for an explicit
        // retry, without silently resubmitting the user's mutation.
        setCsrf("");
        try {
          const tokenBody = await request("/auth/csrf");
          setCsrf(tokenBody.data.csrfToken);
        } catch (e) {
          // Keep retry available if the token endpoint is temporarily offline.
          setCsrf(csrf);
          throw e;
        }
      }
      throw e;
    }
  }
  async function refreshUser() {
    const r = await api("/auth/me");
    setUser(r.data);
    setPatient((p) =>
      r.data.patients?.some((x) => x.id === p)
        ? p
        : r.data.patients?.[0]?.id || "",
    );
  }
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setReady(false); setError(""); setConnectionFailed(false);
    (async () => {
      try {
        const b = await request("/auth/csrf", { signal: controller.signal });
        if (!active) return;
        setCsrf(b.data.csrfToken);
        try {
          const d = await request("/auth/me", { signal: controller.signal });
          if (active) {
            setUser(d.data);
            setPatient(d.data.patients?.[0]?.id || "");
          }
        } catch (e) { if (e.status !== 401) throw e; }
      } catch (e) {
        if (active) { setError(e.message); setConnectionFailed(true); }
      } finally {
        if (active) setReady(true);
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [connectionAttempt]);
  async function list(append = false) {
    const token = ++generation.current;
    if (!patient || !user || !canRead || activeTab === "prescriptions") { setLoading(false); return; }
    setLoading(true);
    setListError("");
    try {
      const r = await api(
        `/patients/${patient}/${activeTab}?limit=20` +
          (append && cursor ? "&cursor=" + encodeURIComponent(cursor) : ""),
        { isCurrent: () => token === generation.current && view === currentView.current },
      );
      if (token !== generation.current || view !== currentView.current) return;
      setRows((old) => (append ? [...old, ...r.data] : r.data));
      setRowsView(view);
      setCursor(r.meta.nextCursor);
    } catch (e) {
      if (token === generation.current && view === currentView.current) {
        setListError(e.message);
        if (e.status === 403 || e.status === 404) { setRows([]); setCursor(null); }
      }
    } finally {
      if (token === generation.current && view === currentView.current) setLoading(false);
    }
  }
  useEffect(() => {
    setRows([]);
    setCursor(null);
    setNotice("");
    setListError(""); setLoading(false);
    setError("");
    pending.current = null;
    if (user && patient) list();
    return () => {
      generation.current++;
    };
  }, [patient, activeTab, user?.id, canRead]);
  async function authenticate(e) {
    e.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    const f = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const r = await api("/auth/" + (register ? "register" : "login"), {
        method: "POST",
        body: JSON.stringify(f),
      });
      setCsrf(r.data.csrfToken);
      await refreshUser();
      setRegister(false);
    } catch (e) {
      setError(e.message);
      return { error: e };
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function logout() {
    generation.current++;
    setRows([]);
    setBusy(true);
    setError("");
    try {
      await api("/auth/logout", { method: "POST" });
      setUser(null);
      setPatient("");
      setRegister(false);
      setShowAccount(false);
      const r = await api("/auth/csrf");
      setCsrf(r.data.csrfToken);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function save(e) {
    e.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    const form = e.currentTarget,
      f = Object.fromEntries(new FormData(form));
    try {
    let body;
    if (activeTab === "cabinet-items")
      body = {
        displayName: f.displayName,
        entryType: "manual",
        ...(f.strengthText ? { strengthText: f.strengthText } : {}),
        ...(f.form ? { form: f.form } : {}),
      };
    else
      body = {
        title: f.title,
        assigneeUserId: f.assigneeUserId || user.id,
        type: f.type,
        ...(f.handoverNote ? { handoverNote: f.handoverNote } : {}),
        ...(f.dueAtUTC ? { dueAtUTC: new Date(f.dueAtUTC).toISOString() } : {}),
      };
    const payload = JSON.stringify(body),
      path = `/patients/${patient}/${activeTab}`;
    if (pending.current?.payload !== payload || pending.current?.path !== path)
      pending.current = { path, payload, key: crypto.randomUUID() };
      await api(path, {
        method: "POST",
        headers: { "Idempotency-Key": pending.current.key },
        body: payload,
      });
      pending.current = null;
      form.reset();
      setNotice("Saved to the database.");
      await list();
    } catch (e) {
      setError(
        e.message +
          " Your entries are retained; retry to check the same submission.",
      );
      return { error: e };
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <header>
        <div className="brand">MediMate</div>
        <span>Medication and caregiver coordination</span>
        {user && (
          <button className="quiet" disabled={busy} onClick={logout}>
            Sign out
          </button>
        )}
      </header>
      <main id="main-content" tabIndex={-1}>
        <p className="eyebrow">Synthetic demonstration · Module 1</p>
        {error && (
          <div role="alert" className="alert">
            {error}
          </div>
        )}
        {notice && (
          <div role="status" className="success">
            {notice}
          </div>
        )}
        {!ready ? (
          <p role="status">Connecting…</p>
        ) : !user ? (
          <section className="auth card">
            <h1>{register ? "Create an account" : "Welcome back"}</h1>
            <p>Sign in to manage your patient records.</p>
            {(!csrf || connectionFailed) && <button disabled={busy} onClick={() => setConnectionAttempt((n) => n + 1)}>Reconnect to server</button>}
            <ValidatedForm onSubmit={authenticate}>
              <fieldset disabled={busy}>
                <label>
                  Email
                  <input
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    maxLength={254}
                  />
                </label>
                <label>
                  Password
                  <input
                    name="password"
                    type="password"
                    autoComplete={
                      register ? "new-password" : "current-password"
                    }
                    required
                    minLength={12}
                    maxLength={128}
                  />
                </label>
                {register && (
                  <label>
                    Display name
                    <input
                      name="displayName"
                      required
                      maxLength={100}
                      autoComplete="name"
                    />
                  </label>
                )}
                <button disabled={!csrf}>
                  {busy
                    ? "Please wait…"
                    : register
                      ? "Create account"
                      : "Sign in"}
                </button>
              </fieldset>
            </ValidatedForm>
            <button
              className="link"
              disabled={busy}
              onClick={() => {
                setRegister(!register);
                setError("");
              }}
            >
              {register
                ? "Already registered? Sign in"
                : "Create a new account"}
            </button>
          </section>
        ) : (
          <>
            <button className="link" disabled={busy} aria-expanded={showAccount} aria-controls="account-settings" onClick={() => setShowAccount(!showAccount)}>{showAccount ? "Close account settings" : "Account and access"}</button>
            <div className="intro">
              <div>
                <h1>Hello, {user.displayName}</h1>
                <p>
                  Review prescriptions, organize your cabinet and hand over
                  tasks.
                </p>
              </div>
              <label>
                Patient
                <select
                  value={patient}
                  disabled={busy}
                  onChange={(e) => setPatient(e.target.value)}
                >
                  <option value="">Choose patient</option>
                  {user.patients?.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.displayName}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {showAccount && <AccountAccess key={user.id + patient} user={user} patient={patient} api={api} refreshUser={refreshUser} onBusy={setBusy} />}
            {!patient ? (
              <p>
                No accessible patient is available. Ask the owner to grant
                access, then sign in again.
              </p>
            ) : !visibleTabs.length ? <p>No work areas are permitted for this patient. Use Account and access to refresh your permissions.</p> : (
              <>
                <nav aria-label="Work areas">
                  {visibleTabs.map(([id, label]) => (
                    <button
                      key={id}
                      disabled={busy}
                      className={activeTab === id ? "selected" : ""}
                      aria-current={activeTab === id ? "page" : undefined}
                      onClick={() => setTab(id)}
                    >
                      {label}
                    </button>
                  ))}
                </nav>
                {activeTab === "prescriptions" ? <PrescriptionReview key={user.id + patient} api={api} patient={patient} permissions={selectedPatient.permissions} onBusy={setBusy} /> : (
                <div className="columns">
                  <section className="card">
                    <h2>
                      {activeTab === "cabinet-items"
                          ? "Add medicine manually"
                          : "Create caregiver task"}
                    </h2>
                    <ValidatedForm key={patient + activeTab} onSubmit={save}>
                      {!canWrite && <p>You do not have permission to create records in this area.</p>}
                      <fieldset disabled={busy || !canWrite}>
                        {activeTab === "cabinet-items" ? (
                          <>
                            <label>
                              Medicine name
                              <input
                                name="displayName"
                                required
                                maxLength={200}
                              />
                            </label>
                            <label>
                              Strength (optional)
                              <input name="strengthText" maxLength={200} />
                            </label>
                            <label>
                              Form (optional)
                              <input
                                name="form"
                                maxLength={200}
                                placeholder="e.g. tablet"
                              />
                            </label>
                            <p className="hint">
                              User-entered medicine. No external identity
                              verification.
                            </p>
                          </>
                        ) : (
                          <>
                            <label>
                              Task title
                              <input name="title" required maxLength={200} />
                            </label>
                            <label>
                              Assign to user ID
                              <input
                                name="assigneeUserId"
                                placeholder={user.id}
                                pattern="[a-fA-F0-9]{24}"
                              />
                            </label>
                            <p className="hint">
                              Leave blank to assign to yourself. Another
                              assignee needs an active task.write grant.
                            </p>
                            <label>
                              Type
                              <select name="type">
                                <option value="general">General</option>
                                <option value="refill">Refill</option>
                              </select>
                            </label>
                            <label>
                              Due (your device local time, optional)
                              <input name="dueAtUTC" type="datetime-local" />
                            </label>
                            <label>
                              Handover note (optional)
                              <textarea name="handoverNote" maxLength={2000} />
                            </label>
                            <p className="hint">
                              Creates an open task. Telegram notifications are
                              not enabled.
                            </p>
                          </>
                        )}
                        <button>
                          {busy
                            ? "Saving…"
                            : "Save " +
                              (activeTab === "tasks"
                                  ? "task"
                                  : "medicine")}
                        </button>
                      </fieldset>
                    </ValidatedForm>
                  </section>
                  <section className="card records" aria-busy={loading}>
                    <div className="section-title">
                      <h2>Saved records</h2>
                      <button
                        className="link"
                        disabled={loading || busy || !canRead}
                        onClick={() => list()}
                      >
                        Refresh
                      </button>
                    </div>
                    {loading && <p role="status">Loading records…</p>}
                    {!canRead && <p>You do not have permission to view saved records in this area.</p>}
                    {listError && <div role="alert" className="alert"><p>{listError}</p><button disabled={loading || busy} onClick={() => list()}>Retry loading records</button></div>}
                    {canRead && !loading && !listError && !visibleRows.length && (
                      <p>
                        No records yet.
                      </p>
                    )}
                    <ul>
                      {visibleRows.map((r) => (
                        <li key={r.id}>
                          <strong>
                            {r.title ||
                              r.displayName ||
                              "Untitled prescription"}
                          </strong>
                          <span className="badge">
                            {activeTab === "prescriptions"
                              ? r.draftVersionId
                                ? "Draft · review required"
                                : r.status
                              : activeTab === "cabinet-items"
                                ? "Manual · user-entered"
                                : r.status}
                          </span>
                          <p>{r.strengthText || r.description || ""}</p>
                          {r.dueAtUTC && (
                            <p>Due: {new Date(r.dueAtUTC).toLocaleString()}</p>
                          )}
                          <small>
                            {new Date(r.createdAt).toLocaleString()}
                          </small>
                        </li>
                      ))}
                    </ul>
                    {cursor && (
                      <button
                        disabled={loading || busy}
                        onClick={() => list(true)}
                      >
                        Load more
                      </button>
                    )}
                  </section>
                </div>
                )}
              </>
            )}
          </>
        )}
        <footer>
          Design prototype data only. Full clinical and emergency workflows are
          still in development.
        </footer>
      </main>
    </>
  );
}
