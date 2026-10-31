import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

function App() {
  const [records,setRecords]=useState([]);
  const [title,setTitle]=useState('');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  async function request(path,options) {
    const response=await fetch(path,options);
    const data=await response.json();
    if(!response.ok) throw new Error(data.error || 'Request failed');
    return data;
  }
  async function refresh() {
    setBusy(true);
    try {setRecords(await request('/api/demo-records'));setMessage('Records loaded from MongoDB.');}
    catch {setMessage('Cannot load records. Check the backend and MongoDB connection.');}
    finally {setBusy(false);}
  }
  useEffect(()=>{refresh();},[]);
  async function save(event) {
    event.preventDefault();setBusy(true);
    try {
      await request('/api/demo-records',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title})});
      setTitle('');
      setRecords(await request('/api/demo-records'));
      setMessage('Saved. Refresh your browser to verify persistence.');
    } catch(error) {setMessage(error.message);}
    finally {setBusy(false);}
  }
  return <main><p className="eyebrow">MEDIMATE · STEP 10</p><h1>Check our connection</h1>
    <p>Save a synthetic test note through React → Express → MongoDB.</p>
    <aside>Development demo only. Use sample text; do not enter personal or medical information.</aside>
    <form onSubmit={save}><label htmlFor="title">Test note</label>
      <input id="title" value={title} onChange={e=>setTitle(e.target.value)} maxLength={120} required placeholder="Example: Team connection test" disabled={busy}/>
      <button disabled={busy || !title.trim()}>{busy?'Working…':'Save to database'}</button></form>
    <p role="status" aria-live="polite">{message}</p>
    <section><h2>Saved records</h2><button onClick={refresh} disabled={busy}>Reload from database</button>
      <ul>{records.map(record=><li key={record._id}><strong>{record.title}</strong><br/><small>{new Date(record.createdAt).toLocaleString()}</small></li>)}</ul>
      {!records.length && <p>No records displayed.</p>}
    </section></main>;
}
createRoot(document.getElementById('root')).render(<App/>);
