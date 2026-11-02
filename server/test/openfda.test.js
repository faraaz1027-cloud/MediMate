import test from "node:test";
import assert from "node:assert/strict";
import { createOpenFDA, projectLabel } from "../v1/openfda.js";
import { fixtureLabel, fixtureId } from "../../verification/step26/fixture.mjs";
const response = (raw = fixtureLabel()) =>
  Response.json({ meta: { results: { total: 1 } }, results: [raw] });

test("openFDA fixed queries, coalescing, cached retrieval time and explicit refresh", async () => {
  let calls = 0,
    clock = Date.parse("2026-11-02T00:00:00Z");
  const urls = [];
  const provider = createOpenFDA({
    spacingMs: 0,
    clock: () => clock,
    fetchImpl: async (url) => {
      calls++;
      urls.push(url);
      return response();
    },
  });
  const [a, b] = await Promise.all([
    provider.search("198440"),
    provider.search("198440"),
  ]);
  assert.deepEqual(a, b);
  assert.equal(calls, 1);
  clock += 1000;
  assert.equal((await provider.search("198440")).retrievedAt, a.retrievedAt);
  assert.equal(calls, 1);
  await provider.search("198440", 0, true);
  assert.equal(calls, 2);
  await provider.resolve(fixtureId, "198440");
  await provider.resolve(fixtureId, "198440");
  assert.equal(calls, 4);
  for (const url of urls) {
    const u = new URL(url);
    assert.equal(u.origin, "https://api.fda.gov");
    assert.equal(u.pathname, "/drug/label.json");
    assert.ok(
      [...u.searchParams.keys()].every((x) =>
        ["search", "limit", "skip", "sort"].includes(x),
      ),
    );
  }
  await assert.rejects(() => provider.search("198440 OR patient:secret"));
  await assert.rejects(() => provider.resolve("https://evil.test", "198440"));
  assert.equal(calls, 4);
});
test("openFDA projection rejects missing/unrelated evidence and preserves exact passage text", () => {
  const raw = fixtureLabel(),
    p = projectLabel(raw, "198440", "2026-11-02T00:00:00Z");
  assert.equal(
    p.passages.find((x) => x.key === "warnings").text,
    raw.warnings[0],
  );
  assert.equal(projectLabel(raw, "123", "now"), null);
  assert.equal(projectLabel({ ...raw, warnings: 42 }, "198440", "now"), null);
  const noPassages = { ...raw };
  delete noPassages.warnings;
  delete noPassages.active_ingredient;
  delete noPassages.storage_and_handling;
  assert.equal(projectLabel(noPassages, "198440", "now"), null);
  assert.equal(
    projectLabel({ ...raw, warnings: ["a".repeat(200001)] }, "198440", "now"),
    null,
  );
});
test("openFDA no-match is distinct from outage, malformed response and provider rate limit", async () => {
  const missing = createOpenFDA({
    spacingMs: 0,
    fetchImpl: async () =>
      Response.json(
        { error: { code: "NOT_FOUND", message: "No matches found!" } },
        { status: 404 },
      ),
  });
  assert.equal((await missing.search("198440")).candidates.length, 0);
  for (const fetchImpl of [
    async () => new Response("broken", { status: 503 }),
    async () => Response.json({ error: { code: "OTHER" } }, { status: 404 }),
    async () => new Response("<html>proxy</html>"),
    async () => Response.json({ results: [] }),
  ]) {
    await assert.rejects(
      () => createOpenFDA({ spacingMs: 0, fetchImpl }).search("198440"),
      (e) => e.code === "OPENFDA_UNAVAILABLE",
    );
  }
  let calls = 0;
  const limited = createOpenFDA({
    spacingMs: 0,
    fetchImpl: async () => {
      calls++;
      return new Response("", { status: 429 });
    },
  });
  await assert.rejects(() => limited.search("198440"));
  await assert.rejects(() => limited.search("198441"));
  assert.equal(calls, 1);
});
test("openFDA aborts timeouts, bounds payloads and applies a per-process daily request budget", async () => {
  const slow = createOpenFDA({
    timeoutMs: 20,
    spacingMs: 0,
    fetchImpl: (_url, { signal }) =>
      new Promise((_resolve, reject) =>
        signal.addEventListener("abort", () => reject(Error("aborted")), {
          once: true,
        }),
      ),
  });
  await assert.rejects(() => slow.search("198440"));
  await assert.rejects(() =>
    createOpenFDA({
      spacingMs: 0,
      fetchImpl: async () => new Response("x".repeat(4 * 1024 * 1024 + 1)),
    }).search("198440"),
  );
  let calls = 0;
  const quota = createOpenFDA({
    dailyLimit: 1,
    spacingMs: 0,
    fetchImpl: async () => {
      calls++;
      return response();
    },
  });
  await quota.search("198440");
  await assert.rejects(() => quota.search("198441"));
  assert.equal(calls, 1);
});
