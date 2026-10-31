import { useState, useEffect, useCallback } from 'react'

const MAX = 120

function formatTime(iso) {
  const d = new Date(iso)
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function App() {
  const [title, setTitle]     = useState('')
  const [notes, setNotes]     = useState([])
  const [health, setHealth]   = useState('checking')  // 'checking' | 'connected' | 'disconnected'
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [feedback, setFeedback] = useState(null)  // { type: 'success'|'error', msg }

  // ── Health check ──────────────────────────────────────────────────────────
  const checkHealth = useCallback(async () => {
    try {
      const r = await fetch('/api/health')
      const data = await r.json()
      setHealth(data.database === 'connected' ? 'connected' : 'disconnected')
    } catch {
      setHealth('disconnected')
    }
  }, [])

  // ── Load notes ────────────────────────────────────────────────────────────
  const loadNotes = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/notes')
      if (!r.ok) throw new Error('Failed to load notes')
      setNotes(await r.json())
    } catch (err) {
      setFeedback({ type: 'error', msg: err.message })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    checkHealth()
    loadNotes()
    const id = setInterval(checkHealth, 10_000)
    return () => clearInterval(id)
  }, [checkHealth, loadNotes])

  // ── Save note ─────────────────────────────────────────────────────────────
  const handleSave = async (e) => {
    e.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) {
      setFeedback({ type: 'error', msg: 'Note title cannot be empty.' })
      return
    }
    if (trimmed.length > MAX) {
      setFeedback({ type: 'error', msg: `Title must not exceed ${MAX} characters.` })
      return
    }

    setSaving(true)
    setFeedback(null)
    try {
      const r = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: trimmed }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Save failed')
      setFeedback({ type: 'success', msg: `Saved ✓  ID: ${data.id}` })
      setTitle('')
      await loadNotes()
    } catch (err) {
      setFeedback({ type: 'error', msg: err.message })
    } finally {
      setSaving(false)
    }
  }

  const charClass = title.length > MAX ? 'over' : title.length > MAX * 0.85 ? 'warn' : ''

  return (
    <main className="app">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <header className="header">
        <div className="header-icon" aria-hidden="true">🩺</div>
        <div>
          <h1>MediMate</h1>
          <p>Step 10 — React → Express → MongoDB</p>
        </div>
      </header>

      {/* ── Health badge ─────────────────────────────────────────────── */}
      <div
        className={`health-badge ${health}`}
        role="status"
        aria-live="polite"
      >
        <span className={`dot ${health === 'checking' ? 'pulse' : ''}`} />
        {health === 'checking' && 'Checking database…'}
        {health === 'connected' && 'Database connected'}
        {health === 'disconnected' && 'Database disconnected'}
      </div>

      {/* ── Note form ─────────────────────────────────────────────────── */}
      <section className="form-card" aria-label="Add a clinical note">
        <form onSubmit={handleSave} noValidate>
          <label htmlFor="note-title-input">New note</label>
          <div className="input-row">
            <input
              id="note-title-input"
              className="note-input"
              type="text"
              placeholder="e.g. Team connection test"
              value={title}
              maxLength={MAX + 1}
              onChange={e => setTitle(e.target.value)}
              disabled={saving}
              autoComplete="off"
            />
            <button
              id="save-note-btn"
              className="save-btn"
              type="submit"
              disabled={saving || !title.trim()}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
          <p className={`char-count ${charClass}`} aria-live="polite">
            {title.length} / {MAX}
          </p>
          {feedback && (
            <div className={`banner ${feedback.type}`} role="alert">
              {feedback.msg}
            </div>
          )}
        </form>
      </section>

      {/* ── Notes list ────────────────────────────────────────────────── */}
      <section aria-label="Saved notes">
        <div className="list-header">
          <h2>Saved notes</h2>
          {!loading && <span className="count">{notes.length} of 100</span>}
        </div>

        {loading ? (
          <div className="notes-list" aria-busy="true">
            {[...Array(4)].map((_, i) => <div key={i} className="skeleton" />)}
          </div>
        ) : notes.length === 0 ? (
          <div className="empty">
            <span>📝</span>
            No notes yet — save your first one above.
          </div>
        ) : (
          <ul className="notes-list" aria-label="Note entries">
            {notes.map(n => (
              <li key={n._id} className="note-item">
                <span className="note-title">{n.title}</span>
                <time className="note-time" dateTime={n.createdAt}>
                  {formatTime(n.createdAt)}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
