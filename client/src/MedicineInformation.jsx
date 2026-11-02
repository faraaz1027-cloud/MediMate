import { useEffect, useRef, useState } from "react";
import ValidatedForm from "./ValidatedForm.jsx";

function Passages({ passages }) {
  return (
    <div className="label-passages">
      {passages.map((p) => (
        <section key={p.key + p.index}>
          <h4>
            {p.key.replaceAll("_", " ")} · paragraph {p.index + 1}
          </h4>
          <blockquote>{p.text}</blockquote>
        </section>
      ))}
    </div>
  );
}
function LabelMetadata({ label }) {
  return (
    <>
      <p>
        {label.metadata.brand_name.join(", ") ||
          label.metadata.generic_name.join(", ")}
      </p>
      <p>Generic: {label.metadata.generic_name.join(", ") || "Not supplied"}</p>
      <p>
        Manufacturer:{" "}
        {label.metadata.manufacturer_name.join(", ") || "Not supplied"}
      </p>
      <p>
        Route: {label.metadata.route.join(", ") || "Not supplied"} · NDC:{" "}
        {label.metadata.product_ndc.join(", ") || "Not supplied"}
      </p>
      <p>
        RxCUI: {label.rxcui} · Label version: {label.version} · Effective date:{" "}
        {label.effectiveTime}
      </p>
    </>
  );
}
export default function MedicineInformation({
  api,
  patient,
  permissions,
  onBusy,
}) {
  const read = permissions.includes("cabinet.read"),
    write = permissions.includes("cabinet.write"),
    base = `/patients/${patient}`;
  const [items, setItems] = useState([]),
    [itemCursor, setItemCursor] = useState(null),
    [loading, setLoading] = useState(false),
    [listError, setListError] = useState("");
  const [selectedId, setSelectedId] = useState(""),
    [detail, setDetail] = useState(null),
    [opening, setOpening] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [results, setResults] = useState(null),
    [cursor, setCursor] = useState(null),
    [searching, setSearching] = useState(false),
    [searchError, setSearchError] = useState(""),
    [candidate, setCandidate] = useState(null),
    [reviewed, setReviewed] = useState(false),
    [note, setNote] = useState(""),
    [saving, setSaving] = useState(false);
  const alive = useRef(true),
    epoch = useRef(0),
    listEpoch = useRef(0),
    searchEpoch = useRef(0),
    lock = useRef(false),
    pending = useRef(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      epoch.current++;
      listEpoch.current++;
      searchEpoch.current++;
    };
  }, [patient]);
  useEffect(() => {
    if (read) loadItems();
  }, [patient, read]);
  async function loadItems(append = false) {
    const e = ++listEpoch.current;
    setLoading(true);
    setListError("");
    try {
      const r = await api(
        `${base}/cabinet-items?limit=20` +
          (append && itemCursor ? `&cursor=${itemCursor}` : ""),
        { isCurrent: () => alive.current && e === listEpoch.current },
      );
      if (alive.current && e === listEpoch.current) {
        setItems((old) => (append ? [...old, ...r.data] : r.data));
        setItemCursor(r.meta.nextCursor);
      }
    } catch (err) {
      if (alive.current && e === listEpoch.current) {
        setListError(err.message);
        if ([403, 404].includes(err.status)) {
          setItems([]);
          setDetail(null);
        }
      }
    } finally {
      if (alive.current && e === listEpoch.current) setLoading(false);
    }
  }
  async function open(itemId) {
    const e = ++epoch.current;
    searchEpoch.current++;
    setSelectedId(itemId);
    setDetail(null);
    setResults(null);
    setCandidate(null);
    setCursor(null);
    setReviewed(false);
    setNote("");
    setError("");
    setSearchError("");
    setNotice("");
    setOpening(!!itemId);
    setSearching(false);
    pending.current = null;
    if (!itemId) return;
    try {
      const opts = { isCurrent: () => alive.current && e === epoch.current },
        [i, c] = await Promise.all([
          api(`${base}/cabinet-items/${itemId}`, opts),
          api(`${base}/cabinet-items/${itemId}/information-card`, opts),
        ]);
      if (opts.isCurrent()) {
        setDetail({ item: i.data, card: c.data });
        setNote(c.data.personalNote);
      }
    } catch (err) {
      if (alive.current && e === epoch.current) setError(err.message);
    } finally {
      if (alive.current && e === epoch.current) setOpening(false);
    }
  }
  async function search(append = false, refresh = false) {
    const e = ++searchEpoch.current,
      d = epoch.current;
    setSearching(true);
    setSearchError("");
    setCandidate(null);
    setReviewed(false);
    try {
      const r = await api(
        `${base}/cabinet-items/${selectedId}/label-candidates` +
          (append && cursor
            ? `?cursor=${cursor}`
            : refresh
              ? "?refresh=true"
              : ""),
        {
          isCurrent: () =>
            alive.current && e === searchEpoch.current && d === epoch.current,
        },
      );
      if (!alive.current || e !== searchEpoch.current || d !== epoch.current)
        return;
      if (r.data.itemRevision !== detail.item.revision)
        throw new Error(
          "Medicine changed. Reload the card before searching again.",
        );
      setResults((old) => ({
        ...r.data,
        candidates: append
          ? [
              ...new Map(
                [...(old?.candidates || []), ...r.data.candidates].map((c) => [
                  c.labelId,
                  c,
                ]),
              ).values(),
            ]
          : r.data.candidates,
      }));
      setCursor(r.meta.nextCursor);
    } catch (err) {
      if (alive.current && e === searchEpoch.current && d === epoch.current) {
        setSearchError(err.message);
        if ([403, 404].includes(err.status)) {
          setDetail(null);
          setResults(null);
        }
      }
    } finally {
      if (alive.current && e === searchEpoch.current && d === epoch.current)
        setSearching(false);
    }
  }
  async function mutation(path, method, body, message) {
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
      const r = await api(
        `${base}/cabinet-items/${selectedId}/information-card` + path,
        {
          method,
          body: payload,
          headers: { "Idempotency-Key": pending.current.key },
          isCurrent: () => alive.current,
        },
      );
      if (!alive.current) return;
      pending.current = null;
      setDetail((old) => ({ ...old, card: r.data }));
      if (path === "/note") setNote(r.data.personalNote);
      setCandidate(null);
      setReviewed(false);
      setNotice(message);
    } catch (err) {
      if (alive.current) {
        setError(err.message);
        if ([403, 404].includes(err.status)) {
          setDetail(null);
          setResults(null);
        }
        return { error: err };
      }
    } finally {
      lock.current = false;
      if (alive.current) setSaving(false);
      onBusy(false);
    }
  }
  const select = (e) => {
    e.preventDefault();
    return mutation(
      "",
      "PUT",
      {
        selectedLabelId: candidate.labelId,
        expectedRevision: detail.card.revision,
        expectedCabinetRevision: detail.item.revision,
        expectedContentHash: candidate.contentHash,
        applicabilityConfirmed: reviewed,
      },
      "Source label saved. Personal notes remain separate.",
    );
  };
  const saveNote = (e) => {
    e.preventDefault();
    return mutation(
      "/note",
      "PATCH",
      { expectedRevision: detail.card.revision, personalNote: note },
      "Personal note saved separately from source evidence.",
    );
  };
  const clearLabel = () =>
    mutation(
      "",
      "PUT",
      {
        selectedLabelId: null,
        expectedRevision: detail.card.revision,
        expectedCabinetRevision: detail.item.revision,
      },
      "Source association removed. Personal note retained.",
    );
  const editable = write && detail?.item.status === "active";
  return (
    <div className="information-workspace">
      <h2>Medicine information</h2>
      <p>
        Read original source passages and keep your own notes separately.
        openFDA data is not medical advice; confirm questions with a health
        professional.
      </p>
      {!read ? (
        <p>Cabinet read permission is required to open information cards.</p>
      ) : (
        <>
          <div className="card information-picker">
            <label>
              Cabinet item
              <select
                disabled={saving || loading}
                value={selectedId}
                onChange={(e) => open(e.target.value)}
              >
                <option value="">Choose a saved medicine</option>
                {items.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.displayName} · {i.status}
                  </option>
                ))}
              </select>
            </label>
            <button disabled={saving || loading} onClick={() => loadItems()}>
              Refresh medicine choices
            </button>
            {itemCursor && (
              <button
                disabled={saving || loading}
                onClick={() => loadItems(true)}
              >
                More medicine choices
              </button>
            )}
            {loading && <p role="status">Loading medicine choices…</p>}
            {listError && <p role="alert">{listError}</p>}
            {!loading && !listError && !items.length && (
              <p>No saved medicines. Add one in Medicine cabinet first.</p>
            )}
          </div>
          {error && (
            <div className="alert" role="alert">
              {error}
              {selectedId && (
                <button
                  disabled={saving || opening}
                  onClick={() => open(selectedId)}
                >
                  Reload information card
                </button>
              )}
            </div>
          )}
          {notice && (
            <p className="success" role="status">
              {notice}
            </p>
          )}
          {opening && <p role="status">Loading saved information card…</p>}
          {detail && (
            <div className="information-columns">
              <div>
                <section className="card">
                  <h3>Selected medicine and source</h3>
                  <p>{detail.item.displayName}</p>
                  <p>
                    Transcribed strength:{" "}
                    {detail.item.strengthText || "Not entered"} · Form:{" "}
                    {detail.item.form || "Not entered"}
                  </p>
                  <p>Cabinet status: {detail.item.status}</p>
                  {detail.item.status === "active" && (
                    <>
                      <button
                        disabled={searching || saving}
                        onClick={() => search()}
                      >
                        Find label candidates
                      </button>
                      <button
                        disabled={searching || saving}
                        onClick={() => search(false, true)}
                      >
                        Refresh label candidates
                      </button>
                    </>
                  )}
                  {searching && (
                    <p role="status">
                      Looking up public product identifiers in openFDA…
                    </p>
                  )}
                  {searchError && (
                    <div className="alert" role="alert">
                      {searchError}
                      <button
                        disabled={searching || saving}
                        onClick={() => search(false, true)}
                      >
                        Retry label lookup
                      </button>
                    </div>
                  )}
                  {results && !results.candidates.length && (
                    <p>
                      {results.reason === "unverified_identity"
                        ? "Label information unavailable: this medicine has no verified RxNorm product identity. No name-only match is used."
                        : "No usable matching label on this page. Try more candidates if available; no unrelated label is attached."}
                    </p>
                  )}
                  {results?.truncated && (
                    <p>
                      Search is bounded to the newest 105 results. A missing
                      applicable product remains unavailable.
                    </p>
                  )}
                  {!!results?.candidates.length && (
                    <>
                      <p>
                        Review the actual product, ingredient, strength, form
                        and manufacturer. An RxNorm mapping is a candidate, not
                        proof that your package matches.
                      </p>
                      <ul className="records label-candidates">
                        {results.candidates.map((c) => (
                          <li key={c.labelId}>
                            <LabelMetadata label={c} />
                            <p>Label ID: {c.labelId}</p>
                            <button
                              disabled={saving || searching}
                              onClick={() => {
                                setCandidate(c);
                                setReviewed(false);
                              }}
                            >
                              Review label {c.labelId}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  {cursor && (
                    <button
                      disabled={searching || saving}
                      onClick={() => search(true)}
                    >
                      More label candidates
                    </button>
                  )}
                </section>
                {candidate && (
                  <section className="card">
                    <h3>Review candidate passages</h3>
                    <LabelMetadata label={candidate} />
                    <p>Retrieved: {candidate.retrievedAt}</p>
                    <a
                      href={candidate.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open candidate source record
                    </a>
                    <Passages passages={candidate.passages} />
                    <ValidatedForm onSubmit={select}>
                      <fieldset disabled={!editable || saving}>
                        <label className="check">
                          <input
                            name="applicabilityConfirmed"
                            type="checkbox"
                            required
                            checked={reviewed}
                            onChange={(e) => setReviewed(e.target.checked)}
                          />
                          I checked this label applies to the actual product,
                          ingredient, strength and form, and reviewed its
                          passages.
                        </label>
                        <button>Save selected label</button>
                      </fieldset>
                    </ValidatedForm>
                  </section>
                )}
                <section className="card">
                  <h3>Saved label passages</h3>
                  {detail.card.itemChanged && (
                    <p className="alert">
                      The medicine changed after this card was saved. These
                      passages describe the retained selection; review
                      applicability again.
                    </p>
                  )}
                  {detail.card.availability === "available" ? (
                    <Passages passages={detail.card.selectedPassages} />
                  ) : (
                    <p>
                      No source label selected. Information unavailable; your
                      personal note can still be saved.
                    </p>
                  )}
                  {detail.card.availability === "available" && (
                    <button disabled={!editable || saving} onClick={clearLabel}>
                      Remove saved label
                    </button>
                  )}
                </section>
                <section className="card personal-note">
                  <h3>Personal note</h3>
                  <p>
                    Private to authorized users of this patient. This is your
                    text, not label evidence.
                  </p>
                  <ValidatedForm onSubmit={saveNote}>
                    <fieldset disabled={!editable || saving}>
                      <label>
                        Personal note
                        <textarea
                          name="personalNote"
                          maxLength={2000}
                          rows={4}
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                        />
                      </label>
                      <button>Save personal note</button>
                    </fieldset>
                  </ValidatedForm>
                </section>
              </div>
              <aside className="card">
                <h3>Source evidence</h3>
                {detail.card.source ? (
                  <>
                    <p>Provider: openFDA drug label</p>
                    <p>Label ID: {detail.card.source.externalId}</p>
                    <p>Set ID: {detail.card.source.snapshot.setId}</p>
                    <p>Label version: {detail.card.source.sourceVersion}</p>
                    <p>Retrieved: {detail.card.source.retrievedAt}</p>
                    <a
                      href={detail.card.source.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open original source record
                    </a>
                    <LabelMetadata label={detail.card.source.snapshot} />
                  </>
                ) : (
                  <p>No source association is saved.</p>
                )}
                <p>
                  Only selected sections are displayed. Absence of a section
                  does not mean no warning or risk. Read the full original
                  label; this card does not change prescribed doses or
                  schedules.
                </p>
              </aside>
            </div>
          )}
        </>
      )}
    </div>
  );
}
