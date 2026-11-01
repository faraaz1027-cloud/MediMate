import { useEffect, useRef, useState } from "react";
import ValidatedForm from "./ValidatedForm.jsx";

const emptyLine = (lineNumber = 1) => ({
  lineNumber,
  medicineText: "",
  instructionsText: "",
  strengthText: "",
  doseQuantity: "",
  doseUnit: "",
  frequencyText: "",
  durationText: "",
  clarificationRequired: true,
});
const units = [
  "tablet",
  "capsule",
  "mL",
  "mg",
  "g",
  "drop",
  "puff",
  "unit",
  "application",
];

export default function PrescriptionReview({
  api,
  patient,
  permissions,
  onBusy,
}) {
  const read = permissions.includes("prescription.read"),
    write = permissions.includes("prescription.write"),
    confirm = permissions.includes("prescription.confirm");
  const [rows, setRows] = useState([]),
    [cursor, setCursor] = useState(null),
    [listError, setListError] = useState(""),
    [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null),
    [detail, setDetail] = useState(null),
    [history, setHistory] = useState([]),
    [historyCursor, setHistoryCursor] = useState(null);
  const [title, setTitle] = useState(""),
    [lines, setLines] = useState([emptyLine()]),
    [source, setSource] = useState(null),
    [corrections, setCorrections] = useState("");
  const [dirty, setDirty] = useState(false),
    [reviewed, setReviewed] = useState(false),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [comparison, setComparison] = useState(null),
    [historical, setHistorical] = useState(null);
  const [scanning, setScanning] = useState(false),
    [progress, setProgress] = useState(""),
    [ocrText, setOcrText] = useState("");
  const alive = useRef(true),
    listGeneration = useRef(0),
    detailGeneration = useRef(0),
    lock = useRef(false),
    pending = useRef(null),
    ocrGeneration = useRef(0),
    worker = useRef(null),
    fileInput = useRef(null);
  const base = `/patients/${patient}/prescriptions`;
  useEffect(() => {
    alive.current = true;
    if (read) reload();
    return () => {
      alive.current = false;
      listGeneration.current++;
      detailGeneration.current++;
      ocrGeneration.current++;
      worker.current?.terminate();
    };
  }, [patient, read]);
  const current = () => alive.current;
  async function reload(append = false) {
    const token = ++listGeneration.current;
    setLoading(true);
    setListError("");
    try {
      const result = await api(
        base +
          "?limit=20" +
          (append && cursor ? "&cursor=" + encodeURIComponent(cursor) : ""),
        { isCurrent: () => current() && token === listGeneration.current },
      );
      if (!current() || token !== listGeneration.current) return;
      setRows((old) => (append ? [...old, ...result.data] : result.data));
      setCursor(result.meta.nextCursor);
    } catch (e) {
      if (current() && token === listGeneration.current) {
        setListError(e.message);
        if ([403, 404].includes(e.status)) setRows([]);
      }
    } finally {
      if (current() && token === listGeneration.current) setLoading(false);
    }
  }
  async function open(recordId) {
    const token = ++detailGeneration.current;
    setSelected(recordId);
    setDetail(null);
    setHistory([]);
    setError("");
    setHistorical(null);
    setComparison(null);
    setReviewed(false);
    try {
      const opts = {
        isCurrent: () => current() && token === detailGeneration.current,
      };
      const [d, h] = await Promise.all([
        api(base + "/" + recordId, opts),
        api(base + "/" + recordId + "/versions?limit=20", opts),
      ]);
      if (!current() || token !== detailGeneration.current) return;
      setDetail(d.data);
      setHistory(h.data);
      setHistoryCursor(h.meta.nextCursor);
      const v = d.data.draftVersion || d.data.currentVersion;
      setTitle(d.data.prescription.title || "");
      setLines(
        v.instructions.map((x) => ({ ...emptyLine(x.lineNumber), ...x })),
      );
      setSource(v.source || null);
      setOcrText(v.source?.ocrText || "");
      setCorrections(v.reviewCorrections || "");
      setDirty(false);
      setFrom(v.previousVersionId || h.data[1]?.id || "");
      setTo(v.id);
    } catch (e) {
      if (current() && token === detailGeneration.current) setError(e.message);
    }
  }
  function fresh() {
    detailGeneration.current++;
    setSelected(null);
    setDetail(null);
    setHistory([]);
    setHistorical(null);
    setComparison(null);
    setTitle("");
    setLines([emptyLine()]);
    setSource(null);
    setOcrText("");
    setProgress("");
    if (fileInput.current) fileInput.current.value = "";
    setCorrections("");
    setReviewed(false);
    setDirty(false);
    setError("");
    setNotice("");
  }
  function edit(index, field, value) {
    setLines((old) =>
      old.map((line, i) => (i === index ? { ...line, [field]: value } : line)),
    );
    setDirty(true);
    setReviewed(false);
  }
  function payloadLines() {
    return lines.map((line) =>
      Object.fromEntries(
        Object.entries(line).filter(
          ([key, value]) =>
            [
              "lineNumber",
              "medicineText",
              "instructionsText",
              "clarificationRequired",
            ].includes(key) ||
            ([
              "strengthText",
              "doseQuantity",
              "doseUnit",
              "frequencyText",
              "durationText",
            ].includes(key) &&
              value !== ""),
        ),
      ),
    );
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
        headers: { "Idempotency-Key": pending.current.key },
        body: payload,
      });
      pending.current = null;
      if (!current()) return;
      setNotice("Saved to the database.");
      if (read) {
        await reload();
        await open(r.data.prescription?.id || selected || r.data.id);
      } else {
        setTitle("");
        setLines([emptyLine()]);
        setSource(null);
        setOcrText("");
        setDirty(false);
      }
    } catch (e) {
      if (current())
        setError(
          e.message +
            " Entries are retained; retry an unchanged submission with the same key.",
        );
      return { error: e };
    } finally {
      lock.current = false;
      if (current()) setSaving(false);
      onBusy(false);
    }
  }
  async function save(event) {
    event.preventDefault();
    const body = {
      instructions: payloadLines(),
      ...(source ? { source } : {}),
    };
    return selected
      ? mutation(
          base + `/${selected}/versions/${detail.draftVersion.id}`,
          "PATCH",
          {
            ...body,
            expectedRevision: detail.draftVersion.revision,
            reviewCorrections: corrections,
          },
        )
      : mutation(base, "POST", { ...body, title });
  }
  async function scan(file) {
    if (!file) return;
    const epoch = ++ocrGeneration.current;
    setError("");
    setProgress("Checking image…");
    setScanning(true);
    onBusy(true);
    let instance,
      timeout,
      expired = false;
    try {
      if (
        !["image/png", "image/jpeg"].includes(file.type) ||
        file.size > 5 * 1024 * 1024 ||
        !file.size
      )
        throw Error("Choose a PNG or JPEG image no larger than 5 MiB.");
      const data = await file.arrayBuffer(),
        bytes = new Uint8Array(data);
      const png =
        bytes[0] === 137 &&
        bytes[1] === 80 &&
        bytes[2] === 78 &&
        bytes[3] === 71 &&
        bytes[4] === 13 &&
        bytes[5] === 10 &&
        bytes[6] === 26 &&
        bytes[7] === 10;
      const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
      if (
        (file.type === "image/png" && !png) ||
        (file.type === "image/jpeg" && !jpeg)
      )
        throw Error("The image contents do not match its type.");
      const bitmap = await createImageBitmap(file),
        width = bitmap.width,
        height = bitmap.height;
      bitmap.close();
      if (
        width < 32 ||
        height < 32 ||
        width > 10000 ||
        height > 10000 ||
        width * height > 20000000
      )
        throw Error(
          "Choose an image between 32 pixels and 20 megapixels, with each side at most 10,000 pixels.",
        );
      const sha256 = [
        ...new Uint8Array(await crypto.subtle.digest("SHA-256", data)),
      ]
        .map((v) => v.toString(16).padStart(2, "0"))
        .join("");
      const metadata = {
        fileName: file.name.slice(0, 200),
        mimeType: file.type,
        sizeBytes: file.size,
        sha256,
        ocrText: "",
        ocrStatus: "failed",
      };
      setSource(metadata);
      setOcrText("");
      setDirty(true);
      setReviewed(false);
      const task = (async () => {
        const { createWorker } = await import("tesseract.js");
        instance = await createWorker("eng", 1, {
          logger: (m) => {
            if (!expired && current() && epoch === ocrGeneration.current)
              setProgress(
                `${m.status} ${Math.round((m.progress || 0) * 100)}%`,
              );
          },
          errorHandler: () => {},
        });
        if (expired || !current() || epoch !== ocrGeneration.current) {
          await instance.terminate();
          return null;
        }
        worker.current = instance;
        return (await instance.recognize(file)).data;
      })();
      const result = await Promise.race([
        task,
        new Promise((_, reject) => {
          timeout = setTimeout(() => {
            expired = true;
            reject(Error("OCR timed out. Retry or enter the draft manually."));
          }, 60000);
        }),
      ]);
      if (!result || !current() || epoch !== ocrGeneration.current) return;
      const suggestion = result.text.slice(0, 30000);
      setOcrText(suggestion);
      setSource({
        ...metadata,
        ocrText: suggestion,
        confidence: result.confidence,
        ocrStatus: suggestion.trim() ? "succeeded" : "failed",
      });
      setProgress(
        suggestion.trim()
          ? "OCR suggestions ready. Correct them and complete every field before saving and reviewing."
          : "No readable text found. Enter the draft manually; nothing has been confirmed.",
      );
    } catch (e) {
      if (current() && epoch === ocrGeneration.current) {
        setProgress("");
        setError(
          e.message || "OCR unavailable. Retry or enter the draft manually.",
        );
      }
    } finally {
      expired = true;
      clearTimeout(timeout);
      await instance?.terminate();
      if (worker.current === instance) worker.current = null;
      if (current() && epoch === ocrGeneration.current) {
        setScanning(false);
        onBusy(false);
      }
    }
  }
  function cancelScan() {
    ocrGeneration.current++;
    worker.current?.terminate();
    worker.current = null;
    setScanning(false);
    setProgress("OCR cancelled. Manual entry remains available.");
    onBusy(false);
  }
  const draft = detail?.draftVersion,
    active = detail?.prescription.status !== "archived",
    editable = write && (!selected || (read && draft && active));
  const readyForReview = draft?.instructions.every(
    (x) =>
      !x.clarificationRequired &&
      Number(x.doseQuantity) > 0 &&
      units.includes(x.doseUnit) &&
      x.frequencyText?.trim() &&
      x.durationText?.trim(),
  );
  return (
    <div className="prescription-workspace">
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
      <div className="columns">
        <section className="card">
          <div className="section-title">
            <h2>
              {selected ? "Review prescription" : "New prescription draft"}
            </h2>
            {write && (
              <button
                className="link"
                disabled={saving || scanning}
                onClick={fresh}
              >
                New draft
              </button>
            )}
          </div>
          {selected && !detail ? (
            <p role="status">Loading prescription…</p>
          ) : editable ? (
            <>
              <p>
                Drafts are unconfirmed. Review is an acknowledgement of your
                transcription, not clinical verification.
              </p>
              <label>
                Printed prescription image (PNG/JPEG, optional)
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/png,image/jpeg"
                  disabled={saving || scanning}
                  onChange={(e) => scan(e.target.files[0])}
                />
              </label>
              <p className="hint">
                English printed text only. The image is processed on this
                device; OCR engine/language files download on first use. The
                original image is not uploaded or retained by MediMate.
              </p>
              {scanning && <button onClick={cancelScan}>Cancel OCR</button>}
              {progress && <p role="status">{progress}</p>}
              {source && (
                <>
                  <p>
                    Source reference: {source.fileName} · {source.ocrStatus}.
                    Keep your original image; only metadata and suggestions are
                    saved.
                  </p>
                  <label>
                    OCR suggestions (unverified)
                    <textarea
                      value={ocrText}
                      maxLength={30000}
                      disabled={saving || scanning}
                      onChange={(e) => {
                        setOcrText(e.target.value);
                        setDirty(true);
                        setReviewed(false);
                      }}
                    />
                  </label>
                  <button
                    disabled={saving || scanning || !ocrText.trim()}
                    onClick={() =>
                      edit(0, "instructionsText", ocrText.slice(0, 2000))
                    }
                  >
                    Copy suggestions to first instruction
                  </button>
                </>
              )}
              <ValidatedForm onSubmit={save}>
                <fieldset disabled={saving || scanning}>
                  <label>
                    Prescription title
                    <input
                      name="title"
                      value={title}
                      required
                      maxLength={200}
                      disabled={!!selected}
                      onChange={(e) => setTitle(e.target.value)}
                    />
                  </label>
                  {lines.map((line, i) => (
                    <fieldset
                      className="instruction-editor"
                      key={line.lineNumber}
                    >
                      <legend>Instruction {line.lineNumber}</legend>
                      {[
                        ["medicineText", "Medicine name", true, 200],
                        [
                          "instructionsText",
                          "Instructions from prescription",
                          true,
                          2000,
                        ],
                        ["strengthText", "Strength (optional)", false, 200],
                        [
                          "frequencyText",
                          "Timing from prescription",
                          false,
                          200,
                        ],
                        [
                          "durationText",
                          "Duration from prescription",
                          false,
                          200,
                        ],
                      ].map(([field, label, required, max]) => (
                        <label key={field}>
                          {label}
                          {field === "instructionsText" ? (
                            <textarea
                              name={`instructions.${i}.${field}`}
                              value={line[field]}
                              required={required}
                              maxLength={max}
                              onChange={(e) => edit(i, field, e.target.value)}
                            />
                          ) : (
                            <input
                              name={`instructions.${i}.${field}`}
                              value={line[field]}
                              required={required}
                              maxLength={max}
                              onChange={(e) => edit(i, field, e.target.value)}
                            />
                          )}
                        </label>
                      ))}
                      <label>
                        Dose quantity
                        <input
                          name={`instructions.${i}.doseQuantity`}
                          inputMode="decimal"
                          pattern="[0-9]{1,12}(\.[0-9]{1,6})?"
                          value={line.doseQuantity}
                          onChange={(e) =>
                            edit(i, "doseQuantity", e.target.value)
                          }
                        />
                      </label>
                      <label>
                        Dose unit
                        <select
                          name={`instructions.${i}.doseUnit`}
                          value={line.doseUnit}
                          onChange={(e) => edit(i, "doseUnit", e.target.value)}
                        >
                          <option value="">Choose unit</option>
                          {units.map((unit) => (
                            <option key={unit}>{unit}</option>
                          ))}
                        </select>
                      </label>
                      <label className="check">
                        <input
                          type="checkbox"
                          name={`instructions.${i}.clarificationRequired`}
                          checked={line.clarificationRequired}
                          onChange={(e) =>
                            edit(i, "clarificationRequired", e.target.checked)
                          }
                        />
                        Needs clarification or review
                      </label>
                      {lines.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            setLines((old) => old.filter((_, n) => n !== i));
                            setDirty(true);
                            setReviewed(false);
                          }}
                        >
                          Remove instruction {line.lineNumber}
                        </button>
                      )}
                    </fieldset>
                  ))}
                  <button
                    type="button"
                    disabled={lines.length >= 30}
                    onClick={() => {
                      setLines((old) => [
                        ...old,
                        emptyLine(
                          Math.max(...old.map((x) => x.lineNumber)) + 1,
                        ),
                      ]);
                      setDirty(true);
                      setReviewed(false);
                    }}
                  >
                    Add instruction
                  </button>
                  {selected && (
                    <label>
                      Review corrections (optional)
                      <textarea
                        name="reviewCorrections"
                        value={corrections}
                        maxLength={5000}
                        onChange={(e) => {
                          setCorrections(e.target.value);
                          setDirty(true);
                          setReviewed(false);
                        }}
                      />
                    </label>
                  )}
                  <button>{saving ? "Saving…" : "Save draft"}</button>
                </fieldset>
              </ValidatedForm>
            </>
          ) : (
            <p>
              {!active
                ? "Archived prescription. History is retained."
                : write
                  ? "Confirmed versions are immutable. Create a replacement draft to make changes."
                  : "Read-only prescription for your permissions."}
            </p>
          )}
          {read && detail?.currentVersion && (
            <section>
              <h3>Confirmed version {detail.currentVersion.versionNumber}</h3>
              <p>
                Confirmed{" "}
                {new Date(detail.currentVersion.confirmedAt).toLocaleString()}.
                No schedule is created automatically.
              </p>
              <ul>
                {detail.currentVersion.instructions.map((x) => (
                  <li key={x.id}>
                    {x.medicineText}: {x.instructionsText} · {x.doseQuantity}{" "}
                    {x.doseUnit} · {x.frequencyText} · {x.durationText}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {read && draft && !editable && (
            <section>
              <h3>Draft version {draft.versionNumber}</h3>
              <ul>
                {draft.instructions.map((x) => (
                  <li key={x.id}>
                    {x.medicineText}: {x.instructionsText} · {x.doseQuantity}{" "}
                    {x.doseUnit} · {x.frequencyText} · {x.durationText} ·{" "}
                    {x.clarificationRequired
                      ? "Needs clarification"
                      : "Reviewed transcription"}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {draft && confirm && active && (
            <ValidatedForm
              onSubmit={(e) => {
                e.preventDefault();
                return mutation(
                  base + `/${selected}/versions/${draft.id}/confirm`,
                  "POST",
                  { expectedRevision: draft.revision, reviewed },
                );
              }}
            >
              <fieldset
                disabled={saving || scanning || dirty || !readyForReview}
              >
                <label className="check">
                  <input
                    name="reviewed"
                    type="checkbox"
                    required
                    checked={reviewed}
                    onChange={(e) => setReviewed(e.target.checked)}
                  />
                  I reviewed every instruction and resolved all ambiguities
                </label>
                <button>Confirm reviewed version</button>
              </fieldset>
              {dirty && <p>Save draft changes before confirmation.</p>}
              {!readyForReview && (
                <p>
                  Before confirmation, save a positive dose quantity, supported
                  unit, timing and duration on every line, and resolve all
                  clarification flags.
                </p>
              )}
            </ValidatedForm>
          )}
          {detail?.currentVersion && write && active && !draft && (
            <button
              disabled={saving || scanning}
              onClick={() =>
                mutation(base + `/${selected}/versions`, "POST", {
                  expectedRevision: detail.prescription.revision,
                  previousVersionId: detail.currentVersion.id,
                  instructions: detail.currentVersion.instructions.map((x) =>
                    Object.fromEntries(
                      Object.entries(x).filter(([key]) =>
                        [
                          "lineNumber",
                          "medicineText",
                          "instructionsText",
                          "strengthText",
                          "doseQuantity",
                          "doseUnit",
                          "frequencyText",
                          "durationText",
                          "clarificationRequired",
                        ].includes(key),
                      ),
                    ),
                  ),
                  ...(detail.currentVersion.source
                    ? { source: detail.currentVersion.source }
                    : {}),
                })
              }
            >
              Create replacement draft
            </button>
          )}
          {selected && read && (
            <button
              className="link"
              disabled={saving || scanning}
              onClick={() => open(selected)}
            >
              Reload version
            </button>
          )}
          {detail && write && active && (
            <button
              disabled={saving || scanning}
              onClick={() =>
                mutation(base + `/${selected}/archive`, "POST", {
                  expectedRevision: detail.prescription.revision,
                })
              }
            >
              Archive prescription
            </button>
          )}
        </section>
        <section className="card records" aria-busy={loading}>
          <div className="section-title">
            <h2>Saved records</h2>
            {read && (
              <button
                className="link"
                disabled={loading || saving || scanning}
                onClick={() => reload()}
              >
                Refresh
              </button>
            )}
          </div>
          {!read && (
            <p>
              You do not have permission to view saved records in this area.
            </p>
          )}
          {loading && <p role="status">Loading records…</p>}
          {listError && (
            <div role="alert" className="alert">
              <p>{listError}</p>
              <button disabled={loading} onClick={() => reload()}>
                Retry loading records
              </button>
            </div>
          )}
          {read && !loading && !listError && !rows.length && (
            <p>No records yet.</p>
          )}
          <ul>
            {(read ? rows : []).map((row) => (
              <li key={row.id}>
                <strong>{row.title || "Untitled prescription"}</strong>
                <span className="badge">
                  {row.status === "archived"
                    ? "Archived"
                    : row.draftVersionId
                      ? "Draft · review required"
                      : "Confirmed"}
                </span>
                <button
                  className="link"
                  disabled={saving || scanning}
                  onClick={() => open(row.id)}
                >
                  Review {row.title || "prescription"}
                </button>
              </li>
            ))}
          </ul>
          {cursor && (
            <button
              disabled={loading || saving || scanning}
              onClick={() => reload(true)}
            >
              Load more
            </button>
          )}
          {read && !!history.length && (
            <>
              <h3>Version history</h3>
              <ol>
                {history.map((v) => (
                  <li key={v.id}>
                    Version {v.versionNumber} — {v.status}
                    <button className="link" onClick={() => setHistorical(v)}>
                      View version {v.versionNumber}
                    </button>
                  </li>
                ))}
              </ol>
              {historyCursor && (
                <button
                  onClick={async () => {
                    try {
                      const token = detailGeneration.current;
                      const h = await api(
                        base +
                          `/${selected}/versions?limit=20&cursor=${encodeURIComponent(historyCursor)}`,
                        {
                          isCurrent: () =>
                            current() && token === detailGeneration.current,
                        },
                      );
                      if (!current() || token !== detailGeneration.current)
                        return;
                      setHistory((old) => [...old, ...h.data]);
                      setHistoryCursor(h.meta.nextCursor);
                    } catch (e) {
                      setError(e.message);
                    }
                  }}
                >
                  Load older versions
                </button>
              )}
              {historical && (
                <section>
                  <h4>Historical version {historical.versionNumber}</h4>
                  <ul>
                    {historical.instructions.map((x) => (
                      <li key={x.id}>
                        {x.medicineText}: {x.instructionsText} ·{" "}
                        {x.doseQuantity} {x.doseUnit} · {x.frequencyText} ·{" "}
                        {x.durationText}
                      </li>
                    ))}
                  </ul>
                  {historical.reviewCorrections && (
                    <p>Corrections: {historical.reviewCorrections}</p>
                  )}
                </section>
              )}
              {history.length > 1 && (
                <>
                  <label>
                    Compare from version
                    <select
                      value={from}
                      onChange={(e) => setFrom(e.target.value)}
                    >
                      <option value="">Choose version</option>
                      {history.map((v) => (
                        <option value={v.id} key={v.id}>
                          Version {v.versionNumber} — {v.status}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Compare to version
                    <select value={to} onChange={(e) => setTo(e.target.value)}>
                      <option value="">Choose version</option>
                      {history.map((v) => (
                        <option value={v.id} key={v.id}>
                          Version {v.versionNumber} — {v.status}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    disabled={!from || !to}
                    onClick={async () => {
                      try {
                        const token = detailGeneration.current;
                        const result = await api(
                          base +
                            `/${selected}/comparison?fromVersionId=${from}&toVersionId=${to}`,
                          {
                            isCurrent: () =>
                              current() && token === detailGeneration.current,
                          },
                        );
                        if (!current() || token !== detailGeneration.current)
                          return;
                        setComparison(result.data);
                      } catch (e) {
                        setError(e.message);
                      }
                    }}
                  >
                    Compare versions
                  </button>
                </>
              )}
              {comparison && (
                <section aria-label="Version comparison">
                  <h3>Version comparison</h3>
                  {!comparison.added.length &&
                    !comparison.removed.length &&
                    !comparison.changed.length && (
                      <p>No instruction differences.</p>
                    )}
                  <ul>
                    {comparison.added.map((x) => (
                      <li key={"add" + x.lineNumber}>
                        Added line {x.lineNumber}: {x.medicineText}
                      </li>
                    ))}
                    {comparison.removed.map((x) => (
                      <li key={"remove" + x.lineNumber}>
                        Removed line {x.lineNumber}: {x.medicineText}
                      </li>
                    ))}
                    {comparison.changed.map((x) => (
                      <li key={x.lineNumber}>
                        Changed line {x.lineNumber}
                        <ul>
                          {x.fields.map((f) => (
                            <li key={f.field}>
                              {f.field}: {String(f.before ?? "(empty)")} →{" "}
                              {String(f.after ?? "(empty)")}
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
