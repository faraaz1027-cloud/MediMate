import TaskBoard from "./TaskBoard.jsx";
import ScheduleBuilder from "./ScheduleBuilder.jsx";
import MedicineInformation from "./MedicineInformation.jsx";
import DoseBoard from "./DoseBoard.jsx";
import MedicineCabinet from "./MedicineCabinet.jsx";
import InventoryBoard from "./InventoryBoard.jsx";
import IngredientReview from "./IngredientReview.jsx";
import EducationalAssistant from "./EducationalAssistant.jsx";
import FollowupBoard from "./FollowupBoard.jsx";
import VisitReports from "./VisitReports.jsx";
import SosBoard from "./SosBoard.jsx";
import EmergencyInbox from "./EmergencyInbox.jsx";
import PrescriptionReview from "./PrescriptionReview.jsx";
import { useEffect, useRef, useState } from "react";
import "./App.css";
import "@fontsource-variable/inter";
import "@fontsource-variable/manrope";
import "./figma.css";
import AccountAccess from "./AccountAccess.jsx";
import ValidatedForm from "./ValidatedForm.jsx";
import { request } from "./request.js";
const tabs = [
  ["prescriptions", "Prescriptions"],
  ["cabinet-items", "Medicine cabinet"],
  ["tasks", "Caregiver tasks"],
  ["schedules", "Medication schedules"],
  ["information", "Medicine information"],
  ["doses", "Today’s doses"],
  ["inventory", "Inventory and refills"],
  ["ingredient-reviews", "Ingredient review"],
  ["education", "Educational assistant"],
  ["followups", "Dose follow-up"],
  ["reports", "Visit reports"],
  ["sos", "SOS coordination"],
];
export default function App() {
  const [dark, setDark] = useState(() => { try { return window.localStorage.getItem("medimate-theme") === "dark"; } catch { return false; } });
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    try { window.localStorage.setItem("medimate-theme", dark ? "dark" : "light"); } catch { /* Theme still works when storage is unavailable. */ }
  }, [dark]);
  const [user, setUser] = useState(null),
    [csrf, setCsrf] = useState(""),
    [ready, setReady] = useState(false),
    [connectionAttempt, setConnectionAttempt] = useState(0),
    [connectionFailed, setConnectionFailed] = useState(false),
    [showAccount, setShowAccount] = useState(false),
    [showEmergencyInbox, setShowEmergencyInbox] = useState(false),
    [register, setRegister] = useState(false),
    [patient, setPatient] = useState(""),
    [tab, setTab] = useState("prescriptions"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const lock = useRef(false);
  const selectedPatient = user?.patients?.find((p) => p.id === patient);
  const prefixes = { prescriptions: "prescription", "cabinet-items": "cabinet", tasks: "task", schedules: "schedule", information: "cabinet", doses: "dose", inventory: "stock", "ingredient-reviews": "cabinet", education: "cabinet", followups: "dose", reports: "report", sos: "sos" };
  const visibleTabs = tabs.filter(([id]) => selectedPatient?.permissions?.some((p) => p === prefixes[id] + ".read" || p === prefixes[id] + ".write" || id === "sos" && ["sos.activate", "sos.manage"].includes(p)));
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
    <div className="care-workspace" data-workspace={activeTab}>
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <header>
        <div className="brand-icon"><img src="/design/capsule.svg" alt="" /></div>
        <div className="brand">MediMate</div>
        <span className="workspace-caption">Care workspace</span>
        {user && <label className="sidebar-patient">Patient
          <select value={patient} disabled={busy} onChange={e => setPatient(e.target.value)}>
            <option value="">Choose patient</option>
            {user.patients?.map(p => <option key={p.id} value={p.id}>{p.displayName}</option>)}
          </select>
        </label>}
        {user && <nav className="workspace-navigation" aria-label="Work areas">
          {visibleTabs.slice().sort((a,b) => ["prescriptions","schedules","cabinet-items","information","tasks","doses","inventory","ingredient-reviews","education","followups","reports","sos"].indexOf(a[0]) - ["prescriptions","schedules","cabinet-items","information","tasks","doses","inventory","ingredient-reviews","education","followups","reports","sos"].indexOf(b[0])).map(([id,label]) => <button key={id} disabled={busy} aria-label={label} className={activeTab === id ? "selected" : ""} aria-current={activeTab === id ? "page" : undefined} onClick={() => { setTab(id); setShowAccount(false); setShowEmergencyInbox(false); }}>
            {({"cabinet-items":"Cabinet",schedules:"Schedule",information:"Information",tasks:"Care tasks",doses:"Today"})[id] || label}
          </button>)}
        </nav>}
        <button className="theme-toggle" onClick={() => setDark(value => !value)} aria-pressed={dark}>{dark ? "Light mode" : "Dark mode"}</button>
        {/* Reserve the same header geometry while the session is loading. */}
        <button
          className="quiet"
          style={{ visibility: user ? "visible" : "hidden" }}
          aria-hidden={!user || undefined}
          disabled={!user || busy}
          onClick={logout}
        >
          Sign out
        </button>
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
            <button className="link" disabled={busy} onClick={() => setShowEmergencyInbox(!showEmergencyInbox)}>{showEmergencyInbox ? "Close emergency inbox" : "Emergency inbox"}</button>
            <div className="intro">
              <div>
                <h1>Hello, {user.displayName}</h1>
                <p>
                  Review prescriptions, plan schedules, organize your cabinet and hand over tasks.
                </p>
              </div>
            </div>
            {!showAccount && !showEmergencyInbox && <section className="workspace-heading" aria-label="Current work area">
              <p className="workspace-owner">{({prescriptions:"A1 / IHFAZ RASHID SADAT", "cabinet-items":"B1 / FARAAZ JAMIL CHOWDHURY",tasks:"C1 / SAHIR JAWAD CHOWDHURY"})[activeTab] || "YOUR CARE WORKSPACE"}</p>
              <h1>{({prescriptions:"Your prescriptions", "cabinet-items":"Medicine cabinet", tasks:"Caregiver tasks"})[activeTab] || tabs.find(([id]) => id === activeTab)?.[1]}</h1>
              <div className="workspace-summary">{({prescriptions:"Import a prescription, review the details, then build a verified schedule.","cabinet-items":"Find an identity. Keep your cabinet organised.",tasks:"Assign clearly. Keep a useful handover history."})[activeTab] || "Review your saved records and coordinate care."}</div>
            </section>}
            {showAccount && !showEmergencyInbox && <AccountAccess key={user.id + patient} user={user} patient={patient} api={api} refreshUser={refreshUser} onBusy={setBusy} />}
            {showEmergencyInbox ? <EmergencyInbox key={user.id} api={api} userId={user.id} onBusy={setBusy} /> : !patient ? (
              <p>
                No accessible patient is available. Ask the owner to grant
                access, then sign in again.
              </p>
            ) : !visibleTabs.length ? <p>No work areas are permitted for this patient. Use Account and access to refresh your permissions.</p> : (
              <>
                {activeTab === "prescriptions" ? <PrescriptionReview key={user.id + patient} api={api} patient={patient} permissions={selectedPatient.permissions} onBusy={setBusy} /> : activeTab === "cabinet-items" ? <MedicineCabinet key={user.id + patient} api={api} patient={patient} permissions={selectedPatient.permissions} onBusy={setBusy} /> : activeTab === "schedules" ? <ScheduleBuilder key={user.id + patient} api={api} patient={patient} permissions={selectedPatient.permissions} onBusy={setBusy} /> : activeTab === "information" ? <MedicineInformation key={user.id + patient} api={api} patient={patient} permissions={selectedPatient.permissions} onBusy={setBusy} /> : activeTab === "doses" ? <DoseBoard key={user.id + patient} api={api} patient={patient} permissions={selectedPatient.permissions} owner={selectedPatient.role === "owner"} onBusy={setBusy} /> : activeTab === "inventory" ? <InventoryBoard key={user.id + patient} api={api} patient={patient} permissions={selectedPatient.permissions} onBusy={setBusy} /> : activeTab === "ingredient-reviews" ? <IngredientReview key={user.id + patient} api={api} patient={patient} permissions={selectedPatient.permissions} onBusy={setBusy} /> : activeTab === "education" ? <EducationalAssistant key={user.id + patient} api={api} patient={patient} permissions={selectedPatient.permissions} onBusy={setBusy} /> : activeTab === "followups" ? <FollowupBoard key={user.id + patient} api={api} patient={patient} permissions={selectedPatient.permissions} owner={selectedPatient.role === "owner"} onBusy={setBusy} /> : activeTab === "reports" ? <VisitReports key={user.id + patient} api={api} patient={patient} permissions={selectedPatient.permissions} onBusy={setBusy} /> : activeTab === "sos" ? <SosBoard key={user.id + patient} api={api} patient={patient} permissions={selectedPatient.permissions} owner={selectedPatient.role === "owner"} userId={user.id} onBusy={setBusy} /> : <TaskBoard key={user.id + patient} api={api} patient={patient} permissions={selectedPatient.permissions} userId={user.id} owner={selectedPatient.role === "owner"} onBusy={setBusy} />}
              </>
            )}
          </>
        )}
        <footer>
          Design prototype data only. Full clinical and emergency workflows are
          still in development.
        </footer>
      </main>
    </div>
  );
}
