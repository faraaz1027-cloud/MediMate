import { useEffect, useRef, useState } from "react";
import ValidatedForm from "./ValidatedForm.jsx";
const permissionLabels = {
  "prescription.read": "View prescriptions", "prescription.write": "Edit prescription drafts", "prescription.confirm": "Confirm reviewed prescriptions",
  "cabinet.read": "View medicine cabinet", "cabinet.write": "Edit medicine cabinet",
  "schedule.read": "View schedules", "schedule.write": "Manage schedules",
  "dose.read": "View dose history", "dose.record": "Record dose actions",
  "stock.read": "View stock", "stock.write": "Update stock",
  "task.read": "View caregiver tasks", "task.write": "Edit caregiver tasks",
  "report.read": "View reports", "report.write": "Write health notes",
  "sos.activate": "Activate SOS", "sos.manage": "Manage SOS", "access.manage": "Manage caregiver access",
};

export default function AccountAccess({ user, patient, api, refreshUser, onBusy }) {
  const profile = user.patients.find((p) => p.id === patient);
  const owner = profile?.role === "owner";
  const [grants, setGrants] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [grantError, setGrantError] = useState(false);
  const [saving, setSaving] = useState(false);
  const lock = useRef(false), pending = useRef(null);
  const base = `/patients/${patient}`;
  useEffect(() => {
    let active = true;
    if (!owner) return;
    setLoading(true);
    api(base + "/access-grants", { isCurrent: () => active }).then((r) => {
      if (active) setGrants(r.data);
    }).catch((e) => { if (active) { setError(e.message); setGrantError(true); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [patient, owner]);
  async function change(path, method, body) {
    if (lock.current) return;
    lock.current = true;
    setSaving(true); onBusy(true); setError(""); setNotice("");
    const payload = JSON.stringify(body);
    if (pending.current?.path !== path || pending.current?.payload !== payload)
      pending.current = { path, payload, key: crypto.randomUUID() };
    try {
      await api(path, { method, headers: { "Idempotency-Key": pending.current.key }, body: payload });
      pending.current = null;
      await refreshUser();
      if (owner) setGrants((await api(base + "/access-grants")).data);
      setNotice("Changes saved. Permissions apply on the next server request.");
    } catch (e) { setError(e.message + " Entries are retained. Refresh details after a revision conflict."); return { error: e }; }
    finally { lock.current = false; setSaving(false); onBusy(false); }
  }
  const fields = (e) => Object.fromEntries(new FormData(e.currentTarget));
  function permissions(values = []) {
    return <div className="permission-options">{user.permissionCatalog.map((p) =>
      <label className="check" key={p}><input type="checkbox" name="permissions" value={p} defaultChecked={values.includes(p)} />{permissionLabels[p]}</label>
    )}</div>;
  }
  return <section id="account-settings" className="card account" aria-label="Account and access">
    <h2>Account and access</h2>
    <p>Your user ID: <code>{user.id}</code>. Share this ID with the patient owner to receive access.</p>
    {error && <p role="alert" className="alert">{error}</p>}
    {notice && <p role="status" className="success">{notice}</p>}
    <button disabled={saving || loading} onClick={async () => {
      setError(""); setLoading(true);
      try { await refreshUser(); if (owner) { setGrants((await api(base + "/access-grants")).data); setGrantError(false); } }
      catch (e) { setError(e.message); } finally { setLoading(false); }
    }}>Refresh account details</button>
    <ValidatedForm onSubmit={(e) => { e.preventDefault(); return change("/me", "PATCH", { ...fields(e), expectedRevision: user.revision }); }}>
      <fieldset disabled={saving}><legend>Your profile</legend>
        <label>Account display name<input key={user.revision} name="displayName" required maxLength={100} defaultValue={user.displayName} /></label>
        <p>Email: {user.email}</p><button>Save profile</button>
      </fieldset>
    </ValidatedForm>
    <ValidatedForm onSubmit={(e) => { e.preventDefault(); return change("/patients", "POST", fields(e)); }}>
      <fieldset disabled={saving}><legend>New patient profile</legend>
        <label>New patient name<input name="displayName" required maxLength={100} /></label>
        <label>New patient timezone<input name="timezone" required defaultValue="Asia/Dhaka" maxLength={100} /></label>
        <button>Create patient</button>
      </fieldset>
    </ValidatedForm>
    {profile && <p>Managing <strong>{profile.displayName}</strong>. Patient role: <strong>{profile.role}</strong>. Effective permissions: {profile.permissions.map((p) => permissionLabels[p]).join(", ") || "none"}.</p>}
    {owner ? <>
      <ValidatedForm key={profile.id + profile.revision} onSubmit={(e) => { e.preventDefault(); return change(base, "PATCH", { ...fields(e), expectedRevision: profile.revision }); }}>
        <fieldset disabled={saving}><legend>Patient profile</legend>
          <label>Patient display name<input name="displayName" required maxLength={100} defaultValue={profile.displayName} /></label>
          <label>Patient timezone<input name="timezone" required maxLength={100} defaultValue={profile.timezone} /></label>
          <button>Save patient profile</button>
        </fieldset>
      </ValidatedForm>
      <h3>Invite a registered caregiver</h3>
      <p>Ask the caregiver to register and share their user ID. Granting access below takes effect immediately; no email invitation is sent.</p>
      <ValidatedForm onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); return change(base + "/access-grants", "POST", { userId: f.get("userId"), permissions: f.getAll("permissions") }); }}>
        <fieldset disabled={saving}><legend>New caregiver access</legend>
          <label>Caregiver user ID<input name="userId" required pattern="[a-fA-F0-9]{24}" /></label>
          {permissions()}<button>Grant caregiver access</button>
        </fieldset>
      </ValidatedForm>
      <h3>Existing access grants</h3>
      {loading && <p role="status">Loading grants…</p>}
      {!loading && !grantError && !grants.length && <p>No caregiver grants.</p>}
      {grants.map((g) => <ValidatedForm key={g.id + ":" + g.revision} onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); return change(base + "/access-grants/" + g.id, "PATCH", { expectedRevision: g.revision, permissions: f.getAll("permissions") }); }}>
        <fieldset disabled={saving}><legend>Caregiver {g.userId} — {g.revokedAt ? "revoked" : "active"}</legend>
          {permissions(g.permissions)}
          <button>{g.revokedAt ? "Restore selected access" : "Update selected access"}</button>
          {!g.revokedAt && <button type="button" onClick={() => change(base + "/access-grants/" + g.id + "/revoke", "POST", { expectedRevision: g.revision })}>Revoke access</button>}
        </fieldset>
      </ValidatedForm>)}
    </> : <p>Only the patient owner administers profiles and caregiver access. Caregivers receive only their named permissions.</p>}
  </section>;
}
