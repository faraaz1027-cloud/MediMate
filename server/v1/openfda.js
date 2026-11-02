import { createHash } from "node:crypto";

export class OpenFDAError extends Error {
  constructor() {
    super(
      "openFDA is unavailable. Retry later; saved evidence and notes are retained.",
    );
    this.status = 503;
    this.code = "OPENFDA_UNAVAILABLE";
  }
}
export const labelIdValid = (x) =>
  typeof x === "string" &&
  /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(x);
export const passageKeys = [
  "active_ingredient",
  "dosage_forms_and_strengths",
  "purpose",
  "indications_and_usage",
  "boxed_warning",
  "contraindications",
  "warnings",
  "warnings_and_cautions",
  "storage_and_handling",
];
const strings = (x) =>
  Array.isArray(x) &&
  x.length <= 200 &&
  x.every((v) => typeof v === "string" && v.length <= 1000);

export function projectLabel(raw, rxcui, retrievedAt) {
  if (
    !raw ||
    !labelIdValid(raw.id) ||
    !labelIdValid(raw.set_id) ||
    typeof raw.version !== "string" ||
    !/^\d{1,8}$/.test(raw.version) ||
    typeof raw.effective_time !== "string" ||
    !/^\d{8}$/.test(raw.effective_time) ||
    !strings(raw.openfda?.rxcui) ||
    !raw.openfda.rxcui.includes(rxcui)
  )
    return null;
  const fields = [
    "brand_name",
    "generic_name",
    "manufacturer_name",
    "route",
    "substance_name",
    "product_ndc",
    "product_type",
  ];
  if (
    fields.some((k) => raw.openfda[k] !== undefined && !strings(raw.openfda[k]))
  )
    return null;
  if (!raw.openfda.brand_name?.length && !raw.openfda.generic_name?.length)
    return null;
  const passages = [];
  for (const key of passageKeys) {
    if (raw[key] === undefined) continue;
    if (
      !Array.isArray(raw[key]) ||
      raw[key].length > 100 ||
      raw[key].some((v) => typeof v !== "string")
    )
      return null;
    for (const [index, text] of raw[key].entries())
      if (text.trim()) passages.push({ key, index, text });
  }
  if (
    !passages.length ||
    passages.reduce((n, p) => n + p.text.length, 0) > 200000
  )
    return null;
  return {
    labelId: raw.id,
    setId: raw.set_id,
    version: raw.version,
    effectiveTime: raw.effective_time,
    rxcui,
    metadata: Object.fromEntries(fields.map((k) => [k, raw.openfda[k] || []])),
    passages,
    retrievedAt,
    sourceUrl:
      "https://api.fda.gov/drug/label.json?search=" +
      encodeURIComponent(`id:"${raw.id}"`),
    contentHash: createHash("sha256").update(JSON.stringify(raw)).digest("hex"),
  };
}

// Fixed host/query fields only. Patient/account/note data never enters this adapter.
export function createOpenFDA({
  fetchImpl = fetch,
  timeoutMs = 8000,
  spacingMs = 300,
  clock = () => Date.now(),
  dailyLimit = 500,
} = {}) {
  const cache = new Map(),
    pending = new Map();
  let tail = Promise.resolve(),
    queued = 0,
    lastStart = 0,
    daily = { day: "", count: 0 },
    retryAt = 0;
  async function json(params, refresh = false) {
    const url =
      "https://api.fda.gov/drug/label.json?" +
      new URLSearchParams(params).toString();
    if (!refresh && cache.get(url)?.expires > clock())
      return cache.get(url).value;
    if (pending.has(url)) return pending.get(url);
    if (queued >= 20 || clock() < retryAt) throw new OpenFDAError();
    queued++;
    const enqueuedAt = clock();
    const job = tail.then(async () => {
      const delay = Math.max(0, lastStart + spacingMs - clock());
      if (delay) await new Promise((r) => setTimeout(r, delay));
      const day = new Date(clock()).toISOString().slice(0, 10);
      if (daily.day !== day) daily = { day, count: 0 };
      if (
        clock() - enqueuedAt > timeoutMs ||
        daily.count >= dailyLimit ||
        clock() < retryAt
      )
        throw new OpenFDAError();
      daily.count++;
      lastStart = clock();
      const controller = new AbortController(),
        timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(url, {
          signal: controller.signal,
          redirect: "error",
          headers: { Accept: "application/json" },
        });
        if (response.status === 429) retryAt = clock() + 60000;
        if (!response.ok && response.status !== 404) throw new OpenFDAError();
        if (!response.body) throw new OpenFDAError();
        const reader = response.body.getReader(),
          chunks = [];
        let size = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 4 * 1024 * 1024) {
            await reader.cancel();
            throw new OpenFDAError();
          }
          chunks.push(Buffer.from(value));
        }
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        let result;
        if (response.status === 404) {
          if (
            body?.error?.code !== "NOT_FOUND" ||
            body.error.message !== "No matches found!"
          )
            throw new OpenFDAError();
          result = { results: [], total: 0 };
        } else {
          if (
            !Array.isArray(body?.results) ||
            !Number.isSafeInteger(body.meta?.results?.total) ||
            body.meta.results.total < 0 ||
            body.results.length > 5 ||
            body.results.some(
              (x) => !x || typeof x !== "object" || Array.isArray(x),
            )
          )
            throw new OpenFDAError();
          result = { results: body.results, total: body.meta.results.total };
        }
        const value = {
          ...result,
          retrievedAt: new Date(clock()).toISOString(),
        };
        if (cache.size >= 100) cache.delete(cache.keys().next().value);
        cache.set(url, { expires: clock() + 12 * 3600000, value });
        return value;
      } catch {
        throw new OpenFDAError();
      } finally {
        clearTimeout(timer);
      }
    });
    tail = job.catch(() => {});
    const tracked = job.finally(() => {
      queued--;
      pending.delete(url);
    });
    pending.set(url, tracked);
    return tracked;
  }
  const validRxcui = (x) => {
    if (typeof x !== "string" || !/^\d{1,12}$/.test(x))
      throw new OpenFDAError();
  };
  return {
    async search(rxcui, offset = 0, refresh = false) {
      validRxcui(rxcui);
      if (!Number.isInteger(offset) || offset < 0 || offset > 100)
        throw new OpenFDAError();
      const r = await json(
        {
          search: `openfda.rxcui:"${rxcui}"`,
          limit: "5",
          skip: String(offset),
          sort: "effective_time:desc",
        },
        refresh,
      );
      return {
        candidates: r.results
          .map((x) => projectLabel(x, rxcui, r.retrievedAt))
          .filter(Boolean),
        retrievedAt: r.retrievedAt,
        nextOffset: offset + 5 < r.total && offset < 100 ? offset + 5 : null,
        truncated: r.total > 105,
      };
    },
    async resolve(labelId, rxcui) {
      validRxcui(rxcui);
      if (!labelIdValid(labelId)) throw new OpenFDAError();
      const r = await json({ search: `id:"${labelId}"`, limit: "1" }, true);
      const raw = r.results.find((x) => x.id === labelId);
      return raw ? projectLabel(raw, rxcui, r.retrievedAt) : null;
    },
  };
}
