import { useEffect, useRef, useState } from "react";
import ValidatedForm from "./ValidatedForm.jsx";

export default function MedicineCabinet({ api, patient, permissions, onBusy }) {
  const read = permissions.includes("cabinet.read"),
    write = permissions.includes("cabinet.write"),
    base = `/patients/${patient}`;
  const [rows, setRows] = useState([]),
    [cursor, setCursor] = useState(null),
    [filters, setFilters] = useState({
      q: "",
      status: "active",
      entryType: "",
    }),
    [loading, setLoading] = useState(false),
    [listError, setListError] = useState("");
  const [query, setQuery] = useState(""),
    [results, setResults] = useState(null),
    [searchCursor, setSearchCursor] = useState(null),
    [searching, setSearching] = useState(false),
    [searchError, setSearchError] = useState("");
  const [selected, setSelected] = useState(null),
    [detail, setDetail] = useState(null),
    [history, setHistory] = useState([]),
    [historyCursor, setHistoryCursor] = useState(null),
    [candidate, setCandidate] = useState(null);
  const [name, setName] = useState(""),
    [strength, setStrength] = useState(""),
    [form, setForm] = useState(""),
    [reason, setReason] = useState(""),
    [reviewed, setReviewed] = useState(false),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const alive = useRef(true),
    listEpoch = useRef(0),
    searchEpoch = useRef(0),
    detailEpoch = useRef(0),
    lock = useRef(false),
    pending = useRef(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      listEpoch.current++;
      searchEpoch.current++;
      detailEpoch.current++;
    };
  }, [patient]);
  useEffect(() => {
    if (read) reload();
    else setRows([]);
  }, [patient, read, filters]);
  async function reload(append = false) {
    const epoch = ++listEpoch.current;
    setLoading(true);
    setListError("");
    const qs = new URLSearchParams({
      limit: "20",
      status: filters.status,
      ...(filters.q ? { q: filters.q } : {}),
      ...(filters.entryType ? { entryType: filters.entryType } : {}),
    });
    if (append && cursor) qs.set("cursor", cursor);
    try {
      const r = await api(base + "/cabinet-items?" + qs, {
        isCurrent: () => alive.current && epoch === listEpoch.current,
      });
      if (!alive.current || epoch !== listEpoch.current) return;
      setRows((old) => (append ? [...old, ...r.data] : r.data));
      setCursor(r.meta.nextCursor);
    } catch (e) {
      if (alive.current && epoch === listEpoch.current) {
        setListError(e.message);
        if ([403, 404].includes(e.status)) {
          setRows([]);
          setCursor(null);
        }
      }
    } finally {
      if (alive.current && epoch === listEpoch.current) setLoading(false);
    }
  }
  function fresh() {
    detailEpoch.current++;
    setSelected(null);
    setDetail(null);
    setHistory([]);
    setHistoryCursor(null);
    setCandidate(null);
    setName("");
    setStrength("");
    setForm("");
    setReason("");
    setReviewed(false);
    setError("");
    setNotice("");
  }
  async function open(itemId) {
    const epoch = ++detailEpoch.current;
    setSelected(itemId);
    setDetail(null);
    setHistory([]);
    setHistoryCursor(null);
    setError("");
    setCandidate(null);
    const opts = {
      isCurrent: () => alive.current && epoch === detailEpoch.current,
    };
    try {
      const [d, h] = await Promise.all([
        api(base + "/cabinet-items/" + itemId, opts),
        api(base + "/cabinet-items/" + itemId + "/revisions?limit=20", opts),
      ]);
      if (!opts.isCurrent()) return;
      setDetail(d.data);
      setHistory(h.data);
      setHistoryCursor(h.meta.nextCursor);
      setName(d.data.displayName);
      setStrength(d.data.strengthText || "");
      setForm(d.data.form || "");
      setReason("");
      setReviewed(false);
    } catch (e) {
      if (opts.isCurrent()) setError(e.message);
    }
  }
  async function search(event, append = false) {
    event?.preventDefault();
    const epoch = ++searchEpoch.current;
    setSearching(true);
    setSearchError("");
    if (!append) setResults(null);
    const qs = new URLSearchParams({ q: query, limit: "20" });
    if (append && searchCursor) qs.set("cursor", searchCursor);
    try {
      const r = await api(base + "/medicine-search?" + qs, {
        isCurrent: () => alive.current && epoch === searchEpoch.current,
      });
      if (!alive.current || epoch !== searchEpoch.current) return;
      setResults((old) => ({
        ...r.data,
        candidates: append
          ? [...(old?.candidates || []), ...r.data.candidates]
          : r.data.candidates,
      }));
      setSearchCursor(r.meta.nextCursor);
    } catch (e) {
      if (alive.current && epoch === searchEpoch.current)
        setSearchError(e.message);
    } finally {
      if (alive.current && epoch === searchEpoch.current) setSearching(false);
    }
  }
  async function choose(c) {
    const epoch = ++searchEpoch.current;
    setSearching(true);
    setSearchError("");
    try {
      const r = await api(base + "/medicine-search/" + c.externalId, {
        isCurrent: () => alive.current && epoch === searchEpoch.current,
      });
      if (!alive.current || epoch !== searchEpoch.current) return;
      fresh();
      setCandidate(r.data);
      setName(r.data.displayName);
    } catch (e) {
      if (alive.current && epoch === searchEpoch.current)
        setSearchError(e.message);
    } finally {
      if (alive.current && epoch === searchEpoch.current) setSearching(false);
    }
  }
  async function mutation(path, method, body) {
    if (lock.current) return;
    lock.current = true;
    setSaving(true);
    onBusy(true);
    setError("");
    setNotice("");
    const payload = JSON.stringify(body);
    if (pending.current?.path !== path || pending.current?.payload !== payload)
      pending.current = { path, payload, key: crypto.randomUUID() };
    try {
      const r = await api(path, {
        method,
        body: payload,
        headers: { "Idempotency-Key": pending.current.key },
        isCurrent: () => alive.current,
      });
      pending.current = null;
      if (!alive.current) return;
      if (read) {
        await reload();
        await open(r.data.id);
      } else fresh();
      setNotice("Saved to the database.");
    } catch (e) {
      if (alive.current)
        setError(
          e.message +
            " Entries are retained; retry unchanged input with the same key.",
        );
      return { error: e };
    } finally {
      lock.current = false;
      if (alive.current) setSaving(false);
      onBusy(false);
    }
  }
  function save(event) {
    event.preventDefault();
    if (selected)
      return mutation(base + `/cabinet-items/${selected}`, "PATCH", {
        expectedRevision: detail.revision,
        ...(detail.entryType === "manual" ? { displayName: name } : {}),
        strengthText: strength,
        form,
        reason,
      });
    return mutation(base + "/cabinet-items", "POST", {
      ...(candidate
        ? { entryType: "external", externalId: candidate.externalId, reviewed }
        : { entryType: "manual", displayName: name }),
      ...(strength ? { strengthText: strength } : {}),
      ...(form ? { form } : {}),
    });
  }
  async function moreHistory() {
    const epoch = detailEpoch.current,
      itemId = selected;
    try {
      const r = await api(
        base +
          `/cabinet-items/${itemId}/revisions?limit=20&cursor=` +
          encodeURIComponent(historyCursor),
        { isCurrent: () => alive.current && epoch === detailEpoch.current },
      );
      if (alive.current && epoch === detailEpoch.current) {
        setHistory((old) => [...old, ...r.data]);
        setHistoryCursor(r.meta.nextCursor);
      }
    } catch (e) {
      if (alive.current && epoch === detailEpoch.current) setError(e.message);
    }
  }
  const editable = write && (!selected || detail?.status === "active"),
    external = candidate || detail?.source;
  return (
    <div className="cabinet-workspace">
      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="success">
          {notice}
        </p>
      )}
      {read && (
        <section className="card">
          <h2>Search RxNorm</h2>
          <p>
            Search by a medicine or ingredient name. Review the complete name,
            strength and form; results are candidates, and none is selected
            automatically. Bangladesh brands may be absent. You can add a
            labelled manual entry.
          </p>
          <p className="hint">
            Only the search term or selected RxNorm ID is sent to the public
            lookup service. Do not enter personal details.
          </p>
          <form onSubmit={search}>
            <label>
              Medicine search
              <input
                name="q"
                value={query}
                minLength={2}
                maxLength={100}
                required
                disabled={saving}
                onChange={(e) => {
                  searchEpoch.current++;
                  setQuery(e.target.value);
                  setResults(null);
                  setSearchCursor(null);
                  setSearchError("");
                  setSearching(false);
                }}
              />
            </label>
            <button disabled={saving || searching}>Search medicines</button>
          </form>
          {searching && <p role="status">Looking up RxNorm…</p>}
          {searchError && (
            <p className="alert" role="alert">
              {searchError}
            </p>
          )}
          {results && (
            <>
              <p>
                RxNorm results retrieved{" "}
                {new Date(results.retrievedAt).toLocaleString()}.
                Clinical/branded drugs only.
              </p>
              {!results.candidates.length && (
                <p>
                  No supported matches. Try another medicine name or add a
                  manual entry.
                </p>
              )}
              <ul className="candidate-list">
                {results.candidates.map((c) => (
                  <li key={c.externalId}>
                    <strong>{c.displayName}</strong>
                    <p>
                      RxCUI {c.externalId} · {c.termType}
                    </p>
                    <a href={c.sourceUrl} target="_blank" rel="noreferrer">
                      RxNorm source for {c.externalId}
                    </a>
                    {write && (
                      <button
                        disabled={saving || searching}
                        onClick={() => choose(c)}
                      >
                        Select {c.externalId}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {searchCursor && (
                <button
                  disabled={saving || searching}
                  onClick={() => search(null, true)}
                >
                  More search results
                </button>
              )}
            </>
          )}
          <p className="hint">
            This product uses publicly available data from the U.S. National
            Library of Medicine (NLM), National Institutes of Health, Department
            of Health and Human Services; NLM is not responsible for the product
            and does not endorse or recommend this or any other product.
          </p>
        </section>
      )}
      <div className="columns">
        <section className="card">
          <div className="section-title">
            <h2>
              {selected
                ? "Cabinet item"
                : candidate
                  ? "Review selected medicine"
                  : "Add medicine manually"}
            </h2>
            {write && (
              <button
                className="link"
                disabled={saving || searching}
                onClick={fresh}
              >
                New manual entry
              </button>
            )}
          </div>
          {!write && (
            <p>You do not have permission to create records in this area.</p>
          )}
          {selected && !detail ? (
            <>
              <p role="status">Loading cabinet item…</p>
              <button disabled={saving} onClick={() => open(selected)}>
                Retry item details
              </button>
            </>
          ) : (
            <>
              <p className="badge">
                {candidate || detail?.entryType === "external"
                  ? "RxNorm · selected identity"
                  : "Manual · user-entered, unverified"}
                {detail ? ` · ${detail.status}` : ""}
              </p>
              {external && (
                <p>
                  Source: RxNorm{" "}
                  <a href={external.sourceUrl} target="_blank" rel="noreferrer">
                    {external.externalId}
                  </a>{" "}
                  · retrieved {new Date(external.retrievedAt).toLocaleString()}.
                  Source name:{" "}
                  {external.snapshot?.displayName || external.displayName}.
                </p>
              )}
              <ValidatedForm onSubmit={save}>
                <fieldset disabled={saving || !editable}>
                  <label>
                    Medicine name
                    <input
                      name="displayName"
                      required
                      maxLength={500}
                      value={name}
                      readOnly={!!candidate || detail?.entryType === "external"}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </label>
                  <label>
                    Strength (optional)
                    <input
                      name="strengthText"
                      maxLength={200}
                      value={strength}
                      onChange={(e) => {
                        setStrength(e.target.value);
                        setReviewed(false);
                      }}
                    />
                  </label>
                  <label>
                    Form (optional)
                    <input
                      name="form"
                      maxLength={200}
                      value={form}
                      onChange={(e) => {
                        setForm(e.target.value);
                        setReviewed(false);
                      }}
                    />
                  </label>
                  <p className="hint">
                    Strength and form here are your transcription. Check the
                    selected source name and your product; these fields are not
                    parsed or clinically verified. Ingredient verification and
                    medicine information cards are later steps.
                  </p>
                  {selected && (
                    <label>
                      Reason for change
                      <input
                        name="reason"
                        required
                        maxLength={500}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                      />
                    </label>
                  )}
                  {candidate && (
                    <label className="check">
                      <input
                        name="reviewed"
                        type="checkbox"
                        checked={reviewed}
                        required
                        onChange={(e) => setReviewed(e.target.checked)}
                      />
                      I reviewed the selected name, strength and form
                    </label>
                  )}
                  {editable && (
                    <button>
                      {saving
                        ? "Saving…"
                        : selected
                          ? "Save changes"
                          : "Save medicine"}
                    </button>
                  )}
                </fieldset>
              </ValidatedForm>
              {detail && (
                <>
                  <button disabled={saving} onClick={() => open(selected)}>
                    Reload item
                  </button>
                  {write && detail.status === "active" && (
                    <button
                      disabled={saving}
                      onClick={() =>
                        mutation(
                          base + `/cabinet-items/${selected}/archive`,
                          "POST",
                          { expectedRevision: detail.revision },
                        )
                      }
                    >
                      Archive medicine
                    </button>
                  )}
                  <h3>Edit history</h3>
                  {!history.length && (
                    <p>
                      No recorded revisions yet. Earlier items receive a
                      baseline snapshot on their first change.
                    </p>
                  )}
                  <ol>
                    {history.map((h) => (
                      <li key={h.id}>
                        <strong>
                          Revision {h.revisionNumber} · {h.snapshot.status}
                        </strong>
                        <p>
                          {h.snapshot.displayName} ·{" "}
                          {h.snapshot.strengthText || "Strength unspecified"} ·{" "}
                          {h.snapshot.form || "Form unspecified"}
                        </p>
                        <p>
                          {h.reason}
                          {h.legacyBaseline ? " (prior author unknown)" : ""}
                        </p>
                        <small>{new Date(h.createdAt).toLocaleString()}</small>
                      </li>
                    ))}
                  </ol>
                  {historyCursor && (
                    <button disabled={saving} onClick={moreHistory}>
                      More edit history
                    </button>
                  )}
                </>
              )}
            </>
          )}
        </section>
        <section className="card records" aria-busy={loading}>
          <div className="section-title">
            <h2>Saved medicines</h2>
            <button
              className="link"
              disabled={saving || loading || !read}
              onClick={() => reload()}
            >
              Refresh
            </button>
          </div>
          {!read ? (
            <p>
              You do not have permission to view saved records in this area.
            </p>
          ) : (
            <>
              <label>
                Filter medicine name
                <input
                  maxLength={100}
                  value={filters.q}
                  disabled={saving}
                  onChange={(e) => {
                    listEpoch.current++;
                    setRows([]);
                    setCursor(null);
                    setFilters({ ...filters, q: e.target.value });
                  }}
                />
              </label>
              <label>
                Cabinet status
                <select
                  value={filters.status}
                  disabled={saving}
                  onChange={(e) => {
                    listEpoch.current++;
                    setRows([]);
                    setCursor(null);
                    setFilters({ ...filters, status: e.target.value });
                  }}
                >
                  <option value="active">Active</option>
                  <option value="archived">Archived</option>
                  <option value="all">All statuses</option>
                </select>
              </label>
              <label>
                Entry source
                <select
                  value={filters.entryType}
                  disabled={saving}
                  onChange={(e) => {
                    listEpoch.current++;
                    setRows([]);
                    setCursor(null);
                    setFilters({ ...filters, entryType: e.target.value });
                  }}
                >
                  <option value="">All sources</option>
                  <option value="external">RxNorm</option>
                  <option value="manual">Manual</option>
                </select>
              </label>
              {loading && <p role="status">Loading records…</p>}
              {listError && (
                <div role="alert" className="alert">
                  <p>{listError}</p>
                  <button disabled={saving || loading} onClick={() => reload()}>
                    Retry loading records
                  </button>
                </div>
              )}
              {!loading && !listError && !rows.length && <p>No records yet.</p>}
              <ul>
                {rows.map((row) => (
                  <li key={row.id}>
                    <strong>{row.displayName}</strong>
                    <p>
                      {row.entryType === "external"
                        ? "RxNorm · selected identity"
                        : "Manual · user-entered, unverified"}{" "}
                      · {row.status}
                    </p>
                    <p>
                      {row.strengthText || ""} {row.form || ""}
                    </p>
                    <button
                      disabled={saving || searching}
                      onClick={() => open(row.id)}
                    >
                      View {row.displayName}
                    </button>
                  </li>
                ))}
              </ul>
              {cursor && (
                <button
                  disabled={saving || loading}
                  onClick={() => reload(true)}
                >
                  Load more
                </button>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
