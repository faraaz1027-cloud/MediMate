import {useEffect,useRef,useState} from "react";
const totals=s=><dl><dt>Taken</dt><dd>{s.taken}</dd><dt>Skipped</dt><dd>{s.skipped}</dd><dt>Pending</dt><dd>{s.pending}</dd><dt>Overdue-unconfirmed</dt><dd>{s.overdueUnconfirmed}</dd><dt>Cancelled (excluded)</dt><dd>{s.cancelled}</dd></dl>;
export default function VisitReports({api,patient,permissions,onBusy}) {
  const base="/patients/"+patient,read=permissions.includes("report.read"),write=permissions.includes("report.write");
  const [from,setFrom]=useState(()=>new Date(Date.now()-7*86400000).toISOString()),[to,setTo]=useState(()=>new Date().toISOString()),[zone,setZone]=useState("Asia/Dhaka");
  const [summary,setSummary]=useState(null),[notes,setNotes]=useState([]),[report,setReport]=useState(null),[edit,setEdit]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const lock=useRef(false),receipt=useRef(null);
  const [exports,setExports]=useState([]),[next,setNext]=useState(null);
  useEffect(()=>{let active=true;const c=new AbortController();if(read)api(base+"/report-exports",{signal:c.signal}).then(r=>{if(active){setExports(r.data.exports);setNext(r.data.next);}}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;c.abort();};},[patient,read]);
  useEffect(()=>{setSummary(null);setNotes([]);setReport(null);setEdit(null);},[patient]);
  async function run(fn){if(lock.current)return;lock.current=true;setBusy(true);onBusy(true);setError("");try{await fn();}catch(e){setError(e.message);}finally{lock.current=false;setBusy(false);onBusy(false);}}
  const query=()=>"?"+new URLSearchParams({fromUTC:from,toUTC:to,timezone:zone});
  async function load(){const [a,b]=await Promise.all([api(base+"/analytics"+query()),api(base+"/health-notes"+query())]);setSummary(a.data);setNotes(b.data);}
  async function save(url,method,body){const signature=JSON.stringify([url,method,body]);if(receipt.current?.signature!==signature)receipt.current={signature,key:crypto.randomUUID()};const r=await api(url,{method,body:JSON.stringify(body),headers:{"Idempotency-Key":receipt.current.key}});return r.data;}
  const changed=()=>{setSummary(null);setNotes([]);};
  if(!read)return <p>Report viewing permission is required for analytics. Health-note writes require report writing permission.</p>;
  return <div className="dose-columns"><section className="card"><h2>Analytics and visit report</h2><p>Choose explicit UTC boundaries and a display timezone. The end boundary is excluded.</p>
    {error&&<p role="alert">{error}</p>}
    <form onSubmit={e=>{e.preventDefault();run(load);}}>
      <label>Report from UTC<input required value={from} disabled={busy} onChange={e=>{setFrom(e.target.value);changed();}}/></label>
      <label>Report to UTC<input required value={to} disabled={busy} onChange={e=>{setTo(e.target.value);changed();}}/></label>
      <label>Report display timezone<input required value={zone} disabled={busy} onChange={e=>{setZone(e.target.value);changed();}}/></label>
      <button disabled={busy}>Load analytics</button>
    </form>
    {summary&&<section aria-label="Live analytics"><h3>Recorded occurrence counts</h3>{totals(summary)}<p>Cutoff: {summary.dataCutoffUTC} · Metric: {summary.metricDefinitionVersion}</p><p>Overdue threshold: {summary.delayMinutes} minutes. {summary.delaySource}. A later snooze defers this threshold.</p><p>Pending and overdue-unconfirmed are separate. Zero means no recorded events in this dataset, and does not prove adherence. Missing source records produce an error.</p></section>}
    <button disabled={busy||!summary} onClick={()=>run(async()=>{const saved=await save(base+"/report-exports","POST",{fromUTC:from,toUTC:to,displayTimezone:zone});const meta=await api(base+"/report-exports/"+saved.id);receipt.current=null;setReport(meta.data);setSummary(meta.data.snapshot);setExports(v=>[{id:meta.data.id,generatedAt:meta.data.generatedAt,expired:false},...v.filter(x=>x.id!==meta.data.id)]);})}>Generate private PDF</button>
    <h3>Saved PDF exports</h3>{exports.map(x=><p key={x.id}><button disabled={busy||x.expired} onClick={()=>run(async()=>setReport((await api(base+"/report-exports/"+x.id)).data))}>{x.expired?"Expired export":"Open saved export"} · {x.generatedAt}</button></p>)}{next&&<button disabled={busy} onClick={()=>run(async()=>{const r=await api(base+"/report-exports?before="+next);setExports(v=>[...v,...r.data.exports]);setNext(r.data.next);})}>Load older exports</button>}
    <h3>Visit and health notes</h3>
    {write&&<form key={edit?.id||"new-note"} onSubmit={e=>{e.preventDefault();const form=e.currentTarget,data=new FormData(form);run(async()=>{await save(base+"/health-notes"+(edit?"/"+edit.id:""),edit?"PATCH":"POST",edit?{expectedRevision:edit.revision,text:data.get("text"),reason:data.get("reason")}:{text:data.get("text"),recordedAt:data.get("recordedAt")});await load();receipt.current=null;setEdit(null);form.reset();});}}>
      <label>Visit note<textarea name="text" required maxLength={2000} defaultValue={edit?.text||""} disabled={busy}/></label>
      {edit?<label>Reason for note revision<input name="reason" required maxLength={500} disabled={busy}/></label>:<label>Note recorded at UTC<input name="recordedAt" required defaultValue={new Date().toISOString()} disabled={busy}/></label>}
      <button disabled={busy}>{edit?"Save note revision":"Save health note"}</button>{edit&&<button type="button" disabled={busy} onClick={()=>setEdit(null)}>Cancel note edit</button>}
    </form>}
    {notes.map(n=><article key={n.id}><p>{n.recordedAt} · Revision {n.revision}</p><p>{n.text}</p>{write&&<button disabled={busy} onClick={()=>setEdit(n)}>Edit health note</button>}</article>)}
  </section>{report&&<section className="card" aria-label="Saved visit report"><h2>Saved visit report</h2><p>Patient: {report.snapshot.patientName}</p><p>Range: {report.snapshot.fromUTC} to {report.snapshot.toUTC}</p><p>Timezone: {report.snapshot.displayTimezone}</p>{totals(report.snapshot)}<p>Generated: {report.generatedAt} · Expires: {report.expiresAt}</p><p>This is a frozen snapshot. Later actions and note edits require a new report.</p>
    <p>{report.snapshot.doses.length} dose entries · {report.snapshot.actions.length} actions · {report.snapshot.prescriptions.length} prescription versions · {report.snapshot.refills.length} refills · {report.snapshot.caregiverActivity.length} task events · {report.snapshot.healthNotes.length} health notes</p>
    <button disabled={busy} onClick={()=>run(async()=>{const r=await api(base+"/report-exports/"+report.id+"/content",{responseType:"blob"});const url=URL.createObjectURL(r.data),a=document.createElement("a");a.href=url;a.download="MediMate-visit-"+report.id+".pdf";document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);})}>Download private PDF</button>
  </section>}</div>;
}
