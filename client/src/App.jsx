import { useEffect, useRef, useState } from "react";
import "./App.css";
const tabs = [
  ["prescriptions", "Prescriptions"],
  ["cabinet-items", "Medicine cabinet"],
  ["tasks", "Caregiver tasks"],
];
export default function App() {
  const [user, setUser] = useState(null),
    [csrf, setCsrf] = useState(""),
    [ready, setReady] = useState(false),
    [register, setRegister] = useState(false),
    [patient, setPatient] = useState(""),
    [tab, setTab] = useState("prescriptions"),
    [rows, setRows] = useState([]),
    [cursor, setCursor] = useState(null),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const generation = useRef(0),
    pending = useRef(null),
    lock = useRef(false);
  async function api(path, options = {}) {
    const r = await fetch("/api/v1" + path, {
      credentials: "same-origin",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.method ? { "X-CSRF-Token": csrf } : {}),
        ...options.headers,
      },
    });
    const b = r.status === 204 ? null : await r.json();
    if (!r.ok) {
      if (r.status === 401) {
        setUser(null);
        setRows([]);
      }
      throw new Error(b?.error?.message || "Request failed.");
    }
    return b;
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
    (async () => {
      try {
        const r = await fetch("/api/v1/auth/csrf", {
          credentials: "same-origin",
          signal: controller.signal,
        });
        const b = await r.json();
        if (!r.ok) throw Error(b.error?.message || "Cannot connect to server.");
        if (!active) return;
        setCsrf(b.data.csrfToken);
        const me = await fetch("/api/v1/auth/me", {
          credentials: "same-origin",
          signal: controller.signal,
        });
        if (me.ok) {
          const d = await me.json();
          if (active) {
            setUser(d.data);
            setPatient(d.data.patients?.[0]?.id || "");
          }
        }
      } catch (e) {
        if (active) setError(e.message);
      } finally {
        if (active) setReady(true);
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, []);
  async function list(append = false) {
    const token = ++generation.current;
    if (!patient || !user) return;
    setLoading(true);
    setError("");
    try {
      const r = await api(
        `/patients/${patient}/${tab}?limit=20` +
          (append && cursor ? "&cursor=" + encodeURIComponent(cursor) : ""),
      );
      if (token !== generation.current) return;
      setRows((old) => (append ? [...old, ...r.data] : r.data));
      setCursor(r.meta.nextCursor);
    } catch (e) {
      if (token === generation.current) {
        setError(e.message);
        setRows([]);
        setCursor(null);
      }
    } finally {
      if (token === generation.current) setLoading(false);
    }
  }
  useEffect(() => {
    setRows([]);
    setCursor(null);
    setNotice("");
    pending.current = null;
    if (user && patient) list();
    return () => {
      generation.current++;
    };
  }, [patient, tab, user?.id]);
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
    } catch (e) {
      setError(e.message);
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
    let body;
    if (tab === "prescriptions")
      body = {
        title: f.title,
        instructions: [
          {
            lineNumber: 1,
            medicineText: f.medicineText,
            instructionsText: f.instructionsText,
            clarificationRequired: f.review === "on",
          },
        ],
      };
    else if (tab === "cabinet-items")
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
      path = `/patients/${patient}/${tab}`;
    if (pending.current?.payload !== payload || pending.current?.path !== path)
      pending.current = { path, payload, key: crypto.randomUUID() };
    try {
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
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <header>
        <div className="brand">MediMate</div>
        <span>Medication and caregiver coordination</span>
        {user && (
          <button className="quiet" disabled={busy} onClick={logout}>
            Sign out
          </button>
        )}
      </header>
      <main>
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
            <form onSubmit={authenticate}>
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
            </form>
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
            {!patient ? (
              <p>
                No accessible patient is available. Ask the owner to grant
                access, then sign in again.
              </p>
            ) : (
              <>
                <nav aria-label="Work areas">
                  {tabs.map(([id, label]) => (
                    <button
                      key={id}
                      disabled={busy}
                      className={tab === id ? "selected" : ""}
                      aria-current={tab === id ? "page" : undefined}
                      onClick={() => setTab(id)}
                    >
                      {label}
                    </button>
                  ))}
                </nav>
                <div className="columns">
                  <section className="card">
                    <h2>
                      {tab === "prescriptions"
                        ? "New prescription draft"
                        : tab === "cabinet-items"
                          ? "Add medicine manually"
                          : "Create caregiver task"}
                    </h2>
                    <form key={patient + tab} onSubmit={save}>
                      <fieldset disabled={busy}>
                        {tab === "prescriptions" ? (
                          <>
                            <label>
                              Prescription title
                              <input name="title" required maxLength={200} />
                            </label>
                            <label>
                              Medicine name
                              <input
                                name="medicineText"
                                required
                                maxLength={200}
                              />
                            </label>
                            <label>
                              Instructions from prescription
                              <textarea
                                name="instructionsText"
                                required
                                maxLength={2000}
                              />
                            </label>
                            <label className="check">
                              <input
                                name="review"
                                type="checkbox"
                                defaultChecked
                              />
                              Needs clarification or review
                            </label>
                            <p className="hint">
                              Saves one instruction as a draft. Confirmation and
                              OCR come later.
                            </p>
                          </>
                        ) : tab === "cabinet-items" ? (
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
                              (tab === "prescriptions"
                                ? "draft"
                                : tab === "tasks"
                                  ? "task"
                                  : "medicine")}
                        </button>
                      </fieldset>
                    </form>
                  </section>
                  <section className="card records" aria-busy={loading}>
                    <div className="section-title">
                      <h2>Saved records</h2>
                      <button
                        className="link"
                        disabled={loading || busy}
                        onClick={() => list()}
                      >
                        Refresh
                      </button>
                    </div>
                    {loading && <p role="status">Loading records…</p>}
                    {!loading && !rows.length && (
                      <p>
                        No records to show. Add your first entry or retry after
                        an error.
                      </p>
                    )}
                    <ul>
                      {rows.map((r) => (
                        <li key={r.id}>
                          <strong>
                            {r.title ||
                              r.displayName ||
                              "Untitled prescription"}
                          </strong>
                          <span className="badge">
                            {tab === "prescriptions"
                              ? r.draftVersionId
                                ? "Draft · review required"
                                : r.status
                              : tab === "cabinet-items"
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
