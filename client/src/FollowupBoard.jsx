import {useEffect,useRef,useState} from "react";
export default function FollowupBoard({api,patient,permissions,owner,onBusy}) {
  const base="/patients/"+patient,read=permissions.includes("dose.read"),write=permissions.includes("dose.record");
  const [pref,setPref]=useState(null),[rows,setRows]=useState([]),[next,setNext]=useState(null),[detail,setDetail]=useState(null),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  const [enabled,setEnabled]=useState(false),[delay,setDelay]=useState(30),[caregiver,setCaregiver]=useState(""),[consent,setConsent]=useState(false),[outcome,setOutcome]=useState("contacted_patient"),[note,setNote]=useState("");
  const locked=useRef(false),receipt=useRef(null);
  async function load(){const r=await api(base+"/followups");setRows(r.data.followups);setNext(r.data.next);}
  useEffect(()=>{let active=true;const c=new AbortController();if(read)Promise.all([api(base+"/followups",{signal:c.signal}),owner?api(base+"/followup-settings",{signal:c.signal}):null]).then(([a,b])=>{if(!active)return;setRows(a.data.followups);setNext(a.data.next);if(b){setPref(b.data);setEnabled(b.data.settings.enabled);setDelay(b.data.settings.delayMinutes);setCaregiver(b.data.settings.caregiverUserId||"");}}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;c.abort();};},[patient,read,owner]);
  async function run(fn){if(locked.current)return;locked.current=true;setBusy(true);onBusy(true);setError("");try{await fn();}catch(e){setError(e.message);}finally{locked.current=false;setBusy(false);onBusy(false);}}
  async function save(url,method,body){const signature=JSON.stringify([url,method,body]);if(receipt.current?.signature!==signature)receipt.current={signature,key:crypto.randomUUID()};const r=await api(url,{method,body:JSON.stringify(body),headers:{"Idempotency-Key":receipt.current.key}});receipt.current=null;return r.data;}
  async function open(id){const r=await api(base+"/followups/"+id);setDetail(r.data);}
  if(!read)return <p>Dose viewing permission is required.</p>;
  return <div className="dose-columns"><section className="card"><h2>Unconfirmed-dose follow-up</h2><p>Overdue means no confirmation was recorded. It does not establish that a dose was skipped or taken.</p>
    {error&&<p role="alert">{error}</p>}
    {owner&&pref&&<form onSubmit={e=>{e.preventDefault();run(async()=>{const r=await save(base+"/followup-settings","PUT",{expectedRevision:pref.settings.revision,enabled,delayMinutes:Number(delay),caregiverUserId:caregiver||null,...(enabled?{consent}: {})});setPref({...pref,settings:r});setConsent(false);});}}>
      <h3>Owner follow-up preferences</h3><label><input type="checkbox" checked={enabled} disabled={busy||!write} onChange={e=>setEnabled(e.target.checked)}/>Enable caregiver follow-up</label>
      <label>Follow-up delay in minutes<input type="number" min="10" max="1440" required value={delay} disabled={busy||!write} onChange={e=>setDelay(e.target.value)}/></label>
      <label>Follow-up caregiver<select required={enabled} value={caregiver} disabled={busy||!write} onChange={e=>setCaregiver(e.target.value)}><option value="">Choose an authorized caregiver</option>{pref.caregivers.map(c=><option key={c.id} value={c.id}>{c.displayName}</option>)}</select></label>
      <p>Caregiver needs dose viewing/recording and task viewing/writing access. Manage grants in Account and access. Link Telegram with separate consent in Caregiver tasks.</p>
      {enabled&&<label><input type="checkbox" checked={consent} disabled={busy||!write} onChange={e=>setConsent(e.target.checked)}/>I consent to sending generic follow-up task notices to this caregiver.</label>}
      <button disabled={busy||!write||enabled&&!consent}>Save follow-up preferences</button>
      {!pref.telegramConfigured&&<p>Telegram is not configured. Follow-ups and tasks are saved; live delivery is unverified.</p>}
    </form>}
    <button disabled={busy} onClick={()=>run(load)}>Refresh follow-ups</button>
    <h3>Saved follow-ups</h3>{!rows.length&&<p>No follow-ups saved. The follow-up worker creates them after the configured delay.</p>}
    {rows.map(f=><p key={f.id}><button disabled={busy} onClick={()=>run(()=>open(f.id))}>{f.status} · {f.dueAtUTC}</button></p>)}
    {next&&<button disabled={busy} onClick={()=>run(async()=>{const r=await api(base+"/followups?before="+next);setRows(v=>[...v,...r.data.followups]);setNext(r.data.next);})}>Load older follow-ups</button>}
  </section>{detail&&<section className="card" aria-label="Follow-up detail"><h2>Follow-up: {detail.status}</h2><p>Saved medicine: {detail.medicineText}</p><p>Scheduled dose: {detail.dueAtUTC}</p><p>Current dose state: {detail.doseState}</p><p>Linked caregiver task: {detail.taskId}</p>
    <p>Acknowledged: {detail.acknowledgedAt||"Not acknowledged"}</p>
    <h3>Notification history</h3>{detail.notices.map(j=><p key={j.id}>{j.status} · {j.errorCode||"No error"} · Attempts: {j.attemptCount}</p>)}
    {detail.attempts.map(a=><p key={a.id}>Attempt {a.attemptNumber}: {a.status} · {a.attemptedAt}</p>)}
    <p>Sent means channel acceptance. Unknown means delivery could not be established. Acknowledgement is a separate action.</p>
    {detail.status==="overdue-unconfirmed"&&<button disabled={busy||!write} onClick={()=>run(async()=>{await save(base+"/followups/"+detail.id+"/acknowledge","POST",{expectedRevision:detail.revision});await open(detail.id);await load();})}>Acknowledge follow-up</button>}
    {detail.status!=="resolved"?<form onSubmit={e=>{e.preventDefault();run(async()=>{await save(base+"/followups/"+detail.id+"/resolve","POST",{expectedRevision:detail.revision,outcome,note});await open(detail.id);await load();});}}>
      <label>Follow-up outcome<select value={outcome} disabled={busy||!write} onChange={e=>setOutcome(e.target.value)}><option value="contacted_patient">Contacted patient</option><option value="unable_to_contact">Unable to contact</option><option value="other">Other</option></select></label>
      <label>Follow-up note<textarea maxLength={2000} value={note} disabled={busy||!write} onChange={e=>setNote(e.target.value)}/></label>
      <p>Resolving follow-up stops its queued notices. Record any confirmed dose action separately in Today’s doses.</p><button disabled={busy||!write}>Resolve follow-up</button>
    </form>:<p>Resolved: {detail.outcome} · {detail.note}</p>}
  </section>}</div>;
}
