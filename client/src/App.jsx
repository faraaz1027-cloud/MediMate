import TaskBoard from "./TaskBoard.jsx";
import ScheduleBuilder from "./ScheduleBuilder.jsx";
import MedicineCabinet from "./MedicineCabinet.jsx";
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
  ["schedules", "Medication schedules"],
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
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const lock = useRef(false);
  const selectedPatient = user?.patients?.find((p) => p.id === patient);
  const prefixes = { prescriptions: "prescription", "cabinet-items": "cabinet", tasks: "task", schedules: "schedule" };
  const visibleTabs = tabs.filter(([id]) => selectedPatient?.permissions?.some((p) => p === prefixes[id] + ".read" || p === prefixes[id] + ".write"));
  const activeTab = visibleTabs.some(([id]) => id === tab) ? tab : visibleTabs[0]?.[0] || tab;
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
        setUser(null);
        setPatient("");
        setNotice("");
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
        <p className="eyebrow">Synthetic demonstration · Project review</p>
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
                  Review prescriptions, plan schedules, organize your cabinet and hand over tasks.
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
                {activeTab === "prescriptions" ? <PrescriptionReview key={user.id + patient} api={api} patient={patient} permissions={selectedPatient.permissions} onBusy={setBusy} /> : activeTab === "cabinet-items" ? <MedicineCabinet key={user.id + patient} api={api} patient={patient} permissions={selectedPatient.permissions} onBusy={setBusy} /> : activeTab === "schedules" ? <ScheduleBuilder key={user.id + patient} api={api} patient={patient} permissions={selectedPatient.permissions} onBusy={setBusy} /> : <TaskBoard key={user.id + patient} api={api} patient={patient} permissions={selectedPatient.permissions} userId={user.id} owner={selectedPatient.role === "owner"} onBusy={setBusy} />}
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
