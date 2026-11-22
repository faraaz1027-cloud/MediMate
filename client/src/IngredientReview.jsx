import { useEffect, useRef, useState } from "react";

const resultText = {
  overlap: "Ingredient overlap found",
  no_overlap_in_confirmed_ingredients: "No overlap in confirmed ingredients",
  insufficient_information: "Insufficient ingredient information",
};
export default function IngredientReview({ api, patient, permissions, onBusy }) {
  const base = "/patients/" + patient;
  const read = permissions.includes("cabinet.read"), write = permissions.includes("cabinet.write");
  const [items,setItems] = useState([]), [cursor,setCursor] = useState(null), [selected,setSelected] = useState([]);
  const [candidate,setCandidate] = useState(null), [reviewed,setReviewed] = useState(false);
  const [history,setHistory] = useState([]), [next,setNext] = useState(null), [review,setReview] = useState(null);
  const [note,setNote] = useState(""), [error,setError] = useState(""), [busy,setBusy] = useState(false);
  const lock = useRef(false), mutation = useRef(null), epoch = useRef(0);
  useEffect(() => {
    const current = ++epoch.current, controller = new AbortController();
    if (read) Promise.all([api(base + "/cabinet-items?status=all&limit=100",{signal:controller.signal}),api(base + "/ingredient-reviews",{signal:controller.signal})])
      .then(([a,b]) => { if (epoch.current !== current) return; setItems(a.data); setCursor(a.meta?.nextCursor); setHistory(b.data.reviews); setNext(b.data.next); })
      .catch(e => { if (epoch.current === current) setError(e.message); });
    return () => { epoch.current++; controller.abort(); };
  },[patient,read]);
  async function run(fn) {
    if (lock.current) return;
    lock.current = true; setBusy(true); onBusy(true); setError("");
    try { await fn(); } catch(e) { setError(e.message); }
    finally { lock.current = false; setBusy(false); onBusy(false); }
  }
  async function save(url,method,body) {
    const signature = JSON.stringify([url,method,body]);
    if (mutation.current?.signature !== signature) mutation.current = { signature,key:crypto.randomUUID() };
    const result = await api(url,{method,body:JSON.stringify(body),headers:{"Idempotency-Key":mutation.current.key}});
    mutation.current = null; return result.data;
  }
  const show = row => { setReview(row); setNote(""); };
  if (!read) return <p>Cabinet viewing permission is required to review ingredients.</p>;
  return <div className="dose-columns">
    <section className="card"><h2>Ingredient and label review</h2>
      <p>Select 2–20 medicines. Confirm the complete ingredient list against each product, strength and form before comparing.</p>
      <p>This comparison covers saved ingredient identities. Overall medicine safety and treatment decisions require professional review.</p>
      {error && <p role="alert">{error}</p>}
      <fieldset disabled={busy}><legend>Cabinet medicines</legend>
        {items.filter(x => x.status === "active").map(x => <div key={x.id}>
          <label><input type="checkbox" checked={selected.includes(x.id)} onChange={e => setSelected(v => e.target.checked ? [...v,x.id] : v.filter(id => id !== x.id))} disabled={!write || (!selected.includes(x.id) && selected.length >= 20)} />{x.displayName} — {x.strengthText || "strength unavailable"}, {x.form || "form unavailable"}</label>
          <button type="button" onClick={() => run(async () => {setCandidate(null); setReviewed(false); const r = await api(base + "/cabinet-items/" + x.id + "/ingredient-candidates"); setCandidate(r.data);})}>Review ingredients for {x.displayName}</button>
        </div>)}
        {!items.length && <p>No medicines saved. Add cabinet items first.</p>}
        {cursor && <button type="button" onClick={() => run(async () => { const r = await api(base + "/cabinet-items?status=all&limit=100&cursor=" + encodeURIComponent(cursor)); setItems(v => [...v,...r.data]); setCursor(r.meta?.nextCursor); })}>Load more medicines</button>}
      </fieldset>
      {candidate && <section aria-label="Ingredient confirmation"><h3>Confirm product ingredients</h3>
        <p>Cabinet: {candidate.cabinetItem.displayName}, {candidate.cabinetItem.strengthText}, {candidate.cabinetItem.form}</p>
        <p>RxNorm product: {candidate.product.displayName}</p>
        <ul>{candidate.ingredients.map(x => <li key={x.externalId}>{x.displayName} (RxCUI {x.externalId})</li>)}</ul>
        <p><a href={candidate.sourceUrl} target="_blank" rel="noreferrer">Ingredient source</a> · Retrieved {candidate.retrievedAt}</p>
        <label><input type="checkbox" checked={reviewed} disabled={busy || !write} onChange={e => setReviewed(e.target.checked)} />I checked that the selected product, strength, form and complete ingredients match the actual medicine.</label>
        <p>If any detail differs or is unclear, correct the cabinet identity and review again.</p>
        <button disabled={busy || !write || !reviewed} onClick={() => run(async () => {
          await save(base + "/cabinet-items/" + candidate.cabinetItem.id + "/ingredient-confirmation","PUT",{expectedRevision:candidate.confirmationRevision,expectedCabinetRevision:candidate.cabinetItem.revision,expectedContentHash:candidate.contentHash,reviewed:true}); setCandidate(null); setReviewed(false);
        })}>Save ingredient confirmation</button>
      </section>}
      <button disabled={busy || !write || selected.length < 2} onClick={() => run(async () => { const row = await save(base + "/ingredient-reviews","POST",{cabinetItemIds:selected}); show(row); setHistory(v => [row,...v.filter(x => x.id !== row.id)]); })}>Compare selected medicines</button>
      <h3>Saved reviews</h3>
      {history.map(x => <p key={x.id}><button disabled={busy} onClick={() => run(async () => show((await api(base + "/ingredient-reviews/" + x.id)).data))}>{resultText[x.result]} · {new Date(x.createdAt).toLocaleString()}</button></p>)}
      {next && <button disabled={busy} onClick={() => run(async () => { const r = await api(base + "/ingredient-reviews?before=" + next); setHistory(v => [...v,...r.data.reviews]); setNext(r.data.next); })}>Load older reviews</button>}
    </section>
    {review && <section className="card" aria-label="Comparison result"><h2>{resultText[review.result]}</h2>
      {review.itemsChanged && <p role="alert">Cabinet details changed after this review. Create a new comparison using current confirmations.</p>}
      {review.ingredientSnapshots.map(x => <div key={x.cabinetItemId}><h3>{x.displayName}</h3><p>{x.strengthText} · {x.form}</p>{x.reason ? <p>Ingredient confirmation missing or outdated.</p> : <ul>{x.ingredients.map(i => <li key={i.externalId}>{i.displayName} (RxCUI {i.externalId})</li>)}</ul>}</div>)}
      <h3>Confirmed overlaps</h3>
      {review.overlaps.length ? <ul>{review.overlaps.map(x => <li key={x.externalId}>{x.displayName} in {x.cabinetItemIds.length} selected medicines.</li>)}</ul> : <p>No overlap identified in the available confirmations. Missing information remains unresolved.</p>}
      <h3>Source evidence</h3>
      {review.evidenceRefs.map((x,i) => <div key={i}>{x.kind === "label_unavailable" ? <p>Label evidence unavailable: {x.reason}</p> : <><p>{x.kind === "ingredient_identity" ? "Ingredient identity" : "Applicability-confirmed label"}: <a href={x.source.sourceUrl} target="_blank" rel="noreferrer">{x.source.provider}</a> · Retrieved {x.source.retrievedAt}</p>{x.passages?.map((p,j) => <blockquote key={j}>{p.text}</blockquote>)}</>}</div>)}
      <p>Missing label passages leave label evidence unavailable. This result cannot establish overall medicine safety.</p>
      {review.acknowledgedAt ? <p>Acknowledged {new Date(review.acknowledgedAt).toLocaleString()}: {review.note || "No note added."}</p> : <form onSubmit={e => {e.preventDefault(); run(async () => show(await save(base + "/ingredient-reviews/" + review.id + "/acknowledge","POST",{expectedRevision:review.revision,note})));}}>
        <label>Acknowledgement note<textarea maxLength={2000} value={note} disabled={busy || !write} onChange={e => setNote(e.target.value)} /></label>
        <button disabled={busy || !write}>Acknowledge this review</button>
      </form>}
    </section>}
  </div>;
}
