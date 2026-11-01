// Only public medicine queries/IDs go upstream, never patient or account data.
export class RxNormError extends Error {
  constructor(status, code, message) {
    super(message);
    Object.assign(this, { status, code });
  }
}
export function createRxNorm({
  fetchImpl = fetch,
  timeoutMs = 8000,
  spacingMs = 110,
  clock = () => Date.now(),
} = {}) {
  const cache = new Map(),
    pending = new Map();
  let tail = Promise.resolve(),
    queued = 0,
    lastStart = 0;
  const unavailable = () =>
    new RxNormError(
      503,
      "RXNORM_UNAVAILABLE",
      "RxNorm is unavailable. Retry or add a clearly labelled manual entry.",
    );
  async function json(path, validate = () => true) {
    const cached = cache.get(path);
    if (cached && cached.expires > clock()) return cached.value;
    if (pending.has(path)) return pending.get(path);
    if (queued >= 25) throw unavailable();
    queued++;
    const enqueuedAt = clock();
    const task = tail.then(async () => {
      const delay = Math.max(0, lastStart + spacingMs - clock());
      if (delay) await new Promise((r) => setTimeout(r, delay));
      if (clock() - enqueuedAt > timeoutMs) throw unavailable();
      lastStart = clock();
      const controller = new AbortController(),
        timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(
          "https://rxnav.nlm.nih.gov/REST/" + path,
          {
            signal: controller.signal,
            redirect: "error",
            headers: { Accept: "application/json" },
          },
        );
        if (!response.ok) throw unavailable();
        const reader = response.body.getReader(),
          chunks = [];
        let size = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 2 * 1024 * 1024) {
            await reader.cancel();
            throw unavailable();
          }
          chunks.push(Buffer.from(value));
        }
        const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (
          !value ||
          typeof value !== "object" ||
          Array.isArray(value) ||
          !validate(value)
        )
          throw unavailable();
        if (cache.size >= 200) cache.delete(cache.keys().next().value);
        const result = { value, retrievedAt: new Date(clock()).toISOString() };
        cache.set(path, { value: result, expires: clock() + 12 * 3600000 });
        return result;
      } catch {
        throw unavailable();
      } finally {
        clearTimeout(timer);
      }
    });
    tail = task.catch(() => {});
    const tracked = task.finally(() => {
      queued--;
      pending.delete(path);
    });
    pending.set(path, tracked);
    return tracked;
  }
  function concept(p) {
    return p &&
      typeof p.rxcui === "string" &&
      /^\d{1,12}$/.test(p.rxcui) &&
      ["SCD", "SBD"].includes(p.tty) &&
      p.suppress === "N" &&
      typeof p.name === "string" &&
      p.name.trim().length > 0 &&
      p.name.length <= 500
      ? {
          externalId: p.rxcui,
          displayName: p.name,
          termType: p.tty,
          sourceUrl: `https://rxnav.nlm.nih.gov/REST/rxcui/${p.rxcui}/properties.json`,
        }
      : null;
  }
  return {
    async search(q) {
      const r = await json(
        "drugs.json?name=" + encodeURIComponent(q),
        (value) => {
          const g = value.drugGroup;
          return (
            g &&
            typeof g === "object" &&
            !Array.isArray(g) &&
            (g.conceptGroup == null ||
              (Array.isArray(g.conceptGroup) &&
                g.conceptGroup.every(
                  (x) =>
                    x &&
                    typeof x === "object" &&
                    !Array.isArray(x) &&
                    (x.conceptProperties == null ||
                      Array.isArray(x.conceptProperties)),
                )))
          );
        },
      );
      if (!r.value.drugGroup || typeof r.value.drugGroup !== "object")
        throw unavailable();
      const groups = r.value.drugGroup.conceptGroup ?? [];
      if (!Array.isArray(groups)) throw unavailable();
      const candidates = new Map();
      for (const group of groups) {
        if (
          group.conceptProperties != null &&
          !Array.isArray(group.conceptProperties)
        )
          throw unavailable();
        for (const p of group.conceptProperties ?? []) {
          const c = concept(p);
          if (c) candidates.set(c.externalId, c);
        }
      }
      return {
        candidates: [...candidates.values()].sort(
          (a, b) =>
            a.displayName.localeCompare(b.displayName) ||
            a.externalId.localeCompare(b.externalId),
        ),
        provider: "rxnorm",
        retrievedAt: r.retrievedAt,
      };
    },
    async resolve(externalId) {
      const r = await json(`rxcui/${externalId}/properties.json`),
        selected = concept(r.value.properties);
      if (!selected || selected.externalId !== externalId)
        throw new RxNormError(
          422,
          "RXNORM_CANDIDATE_UNAVAILABLE",
          "Choose an active RxNorm clinical or branded drug, or add a manual entry.",
        );
      return { ...selected, provider: "rxnorm", retrievedAt: r.retrievedAt };
    },
  };
}
