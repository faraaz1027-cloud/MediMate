import {useEffect,useRef,useState} from "react";
const suggestions=["What warnings are in the label?","How does the label say to store this medicine?","What is the labelled purpose?","What active ingredients does the label list?"];
export default function EducationalAssistant({api,patient,permissions,onBusy}) {
  const base="/patients/"+patient, read=permissions.includes("cabinet.read"),write=permissions.includes("cabinet.write");
  const [items,setItems]=useState([]),[cursor,setCursor]=useState(null),[item,setItem]=useState("");
  const [question,setQuestion]=useState(suggestions[0]),[history,setHistory]=useState([]),[next,setNext]=useState(null),[answer,setAnswer]=useState(null);
  const [error,setError]=useState(""),[busy,setBusy]=useState(false);
  const lock=useRef(false),receipt=useRef(null);
  useEffect(()=>{let active=true;const c=new AbortController();if(read) Promise.all([api(base+"/cabinet-items?status=all&limit=100",{signal:c.signal}),api(base+"/educational-answers",{signal:c.signal})]).then(([a,b])=>{if(active){setItems(a.data);setCursor(a.meta?.nextCursor);setHistory(b.data.answers);setNext(b.data.next);}}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;c.abort();};},[patient,read]);
  async function run(fn){if(lock.current)return;lock.current=true;setBusy(true);onBusy(true);setError("");try{await fn();}catch(e){setError(e.message);}finally{lock.current=false;setBusy(false);onBusy(false);}}
  async function save(path,method,body){const signature=JSON.stringify([path,method,body]);if(receipt.current?.signature!==signature)receipt.current={signature,key:crypto.randomUUID()};const r=await api(path,{method,body:JSON.stringify(body),headers:{"Idempotency-Key":receipt.current.key}});return r.data;}
  async function open(id){const r=await api(base+"/educational-answers/"+id);receipt.current=null;setAnswer(r.data);setHistory(v=>[r.data,...v.filter(x=>x.id!==id)]);}
  if(!read)return <p>Cabinet viewing permission is required.</p>;
  return <div className="dose-columns"><section className="card"><h2>Educational source assistant</h2>
    <p>Search saved, applicability-confirmed label excerpts. Choose one of the supported questions below. Personal treatment decisions require a qualified professional.</p>
    <p>Answers use exact saved text. No model, external question transmission or live source refresh is used. Review current sources in Medicine information.</p>
    {error&&<p role="alert">{error}</p>}
    <form onSubmit={e=>{e.preventDefault();run(async()=>{const r=await save(base+"/educational-answers","POST",{cabinetItemId:item,question});await open(r.id);});}}>
      <label>Medicine for educational question<select required value={item} disabled={busy||!write} onChange={e=>setItem(e.target.value)}><option value="">Choose medicine</option>{items.filter(x=>x.status==="active").map(x=><option key={x.id} value={x.id}>{x.displayName}</option>)}</select></label>
      {cursor&&<button type="button" disabled={busy} onClick={()=>run(async()=>{const r=await api(base+"/cabinet-items?status=all&limit=100&cursor="+encodeURIComponent(cursor));setItems(v=>[...v,...r.data]);setCursor(r.meta?.nextCursor);})}>Load more medicines</button>}
      <label>Supported question<select value={suggestions.includes(question)?question:""} disabled={busy||!write} onChange={e=>setQuestion(e.target.value)}><option value="" disabled>Custom question</option>{suggestions.map(q=><option key={q}>{q}</option>)}</select></label>
      <label>Educational question<textarea required maxLength={2000} value={question} disabled={busy||!write} onChange={e=>setQuestion(e.target.value)}/></label>
      <button disabled={busy||!write||!item}>Find cited passages</button>
    </form>
    <h3>Saved questions</h3>{history.map(x=><p key={x.id}><button disabled={busy} onClick={()=>run(()=>open(x.id))}>{x.question}</button></p>)}
    {next&&<button disabled={busy} onClick={()=>run(async()=>{const r=await api(base+"/educational-answers?before="+next);setHistory(v=>[...v,...r.data.answers]);setNext(r.data.next);})}>Load older questions</button>}
  </section>{answer&&<section className="card" aria-label="Educational answer"><h2>{answer.outcome==="answered"?"Cited label excerpts":answer.outcome==="error"?"Source unavailable":"Insufficient evidence"}</h2>
    <p>{answer.question}</p><p>Saved medicine: {answer.medicineName}</p>
    {answer.itemChanged&&<p role="alert">Medicine details changed. Review the current label and ask again.</p>}
    {answer.reason==="unsupported_question"&&<p>This source search supports the listed educational questions only. It cannot answer personal treatment requests or invented topics.</p>}
    {answer.reason==="multiple_passages_require_review"&&<p>Several different passages match. Their agreement has not been established; review all passages with a qualified professional.</p>}
    {!answer.citations.length&&<p>No applicable cited excerpt is available. Check the saved label and its applicability in Medicine information.</p>}
    {answer.citations.map((c,i)=><div key={i}><blockquote>{c.text}</blockquote><p><a href={c.sourceUrl} target="_blank" rel="noreferrer">{c.provider}: {c.key}, passage {c.index+1}</a> · Retrieved {c.retrievedAt} · Version {c.sourceVersion||"unavailable"}</p></div>)}
    <p>Excerpts are educational source text. They do not establish individual suitability or resolve conflicting statements.</p>
    <p>Feedback: {answer.rating||"Not recorded"}</p>
    {["helpful","unhelpful"].map(r=><button key={r} disabled={busy||!write} onClick={()=>run(async()=>{await save(base+"/educational-answers/"+answer.id+"/feedback","PATCH",{expectedRevision:answer.revision,rating:r});await open(answer.id);})}>Mark {r}</button>)}
    <button disabled={busy||!write} onClick={()=>run(async()=>{await save(base+"/educational-answers/"+answer.id,"DELETE",{expectedRevision:answer.revision});receipt.current=null;setHistory(v=>v.filter(x=>x.id!==answer.id));setAnswer(null);})}>Delete saved question and excerpts</button>
  </section>}</div>;
}
