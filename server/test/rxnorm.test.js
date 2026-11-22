import test from "node:test";
import assert from "node:assert/strict";
import { createRxNorm } from "../v1/rxnorm.js";
const props = {
  rxcui: "198440",
  name: "acetaminophen 500 MG Oral Tablet",
  tty: "SCD",
  suppress: "N",
};
test("ingredient relation validates completeness, canonical IDs and malformed responses", async () => {
  const ingredient = { rxcui: "161", name: "acetaminophen", tty: "IN", suppress: "N" };
  const relation = entries => ({ relatedGroup: { rxcui: "198440", conceptGroup: [{ tty: "IN", conceptProperties: entries }] } });
  const provider = value => createRxNorm({ spacingMs: 0, fetchImpl: async () => Response.json(value) });
  const valid = await provider(relation([ingredient,ingredient])).ingredients("198440");
  assert.equal(valid.ingredients.length,1);
  assert.equal(valid.ingredients[0].externalId,"161");
  assert.equal((await provider({relatedGroup:{rxcui:null,conceptGroup:[{tty:"IN",conceptProperties:[ingredient]}]}}).ingredients("198440")).ingredients[0].externalId,"161");
  for (const value of [ {}, {relatedGroup:{rxcui:"other",conceptGroup:[]}}, relation([{...ingredient,tty:"PIN"}]), relation([{...ingredient,suppress:"Y"}]), relation([{...ingredient,name:""}]), relation(Array.from({length:21},(_,i)=>({...ingredient,rxcui:String(i+1)}))) ]) {
    await assert.rejects(provider(value).ingredients("198440"),e=>e.code === "RXNORM_UNAVAILABLE");
  }
  assert.deepEqual((await provider(relation([])).ingredients("198440")).ingredients,[]);
});
test("RxNorm adapter coalesces, caches for 12 hours and constructs only fixed upstream URLs", async () => {
  let count = 0,
    time = 1000;
  const urls = [];
  const provider = createRxNorm({
    spacingMs: 0,
    clock: () => time,
    fetchImpl: async (url) => {
      count++;
      urls.push(url);
      return Response.json({
        drugGroup: {
          conceptGroup: [
            {
              conceptProperties: [
                props,
                props,
                { ...props, rxcui: "2", tty: "BPCK" },
              ],
            },
          ],
        },
      });
    },
  });
  const [a, b] = await Promise.all([
    provider.search("a & b"),
    provider.search("a & b"),
  ]);
  assert.deepEqual(a, b);
  assert.equal(a.candidates.length, 1);
  assert.equal(count, 1);
  assert.equal(
    urls[0],
    "https://rxnav.nlm.nih.gov/REST/drugs.json?name=a%20%26%20b",
  );
  time += 12 * 3600000 - 1;
  await provider.search("a & b");
  assert.equal(count, 1);
  time += 2;
  await provider.search("a & b");
  assert.equal(count, 2);
});
test("RxNorm no-match differs from outage, invalid JSON and malformed provider data", async () => {
  for (const value of ["network", "http", "json", "shape"]) {
    const provider = createRxNorm({
      spacingMs: 0,
      fetchImpl: async () => {
        if (value === "network") throw Error();
        if (value === "http") return new Response("busy", { status: 429 });
        if (value === "json") return new Response("<html>");
        return Response.json({ bad: true });
      },
    });
    await assert.rejects(
      () => provider.search("demo"),
      (e) => e.code === "RXNORM_UNAVAILABLE" && e.status === 503,
    );
  }
  const p = createRxNorm({
    spacingMs: 0,
    fetchImpl: async () => Response.json({ drugGroup: { name: null } }),
  });
  assert.equal((await p.search("unmatched")).candidates.length, 0);
  let retries = 0;
  const recovering = createRxNorm({
    spacingMs: 0,
    fetchImpl: async () =>
      Response.json(
        ++retries === 1
          ? { drugGroup: [] }
          : { drugGroup: { conceptGroup: [{ conceptProperties: null }] } },
      ),
  });
  await assert.rejects(
    () => recovering.search("recover"),
    (e) => e.status === 503,
  );
  assert.equal((await recovering.search("recover")).candidates.length, 0);
  assert.equal(
    retries,
    2,
    "Malformed successful responses must not poison the cache",
  );
});
test("RxNorm resolves only active SCD/SBD identities and bounds response bodies", async () => {
  const p = createRxNorm({
    spacingMs: 0,
    fetchImpl: async () => Response.json({ properties: props }),
  });
  assert.equal((await p.resolve("198440")).displayName, props.name);
  await assert.rejects(
    () => p.resolve("123"),
    (e) => e.code === "RXNORM_CANDIDATE_UNAVAILABLE",
  );
  const large = createRxNorm({
    spacingMs: 0,
    fetchImpl: async () => new Response("x".repeat(2 * 1024 * 1024 + 1)),
  });
  await assert.rejects(
    () => large.search("large"),
    (e) => e.status === 503,
  );
});
test("RxNorm timeout aborts the upstream request and failed lookups are retryable", async () => {
  let calls = 0;
  const p = createRxNorm({
    spacingMs: 0,
    timeoutMs: 20,
    fetchImpl: async (_url, { signal }) => {
      calls++;
      if (calls > 1) return Response.json({ drugGroup: {} });
      return new Promise((_, reject) =>
        signal.addEventListener("abort", () => reject(Error("aborted"))),
      );
    },
  });
  await assert.rejects(
    () => p.search("retry"),
    (e) => e.status === 503,
  );
  assert.equal((await p.search("retry")).candidates.length, 0);
  assert.equal(calls, 2);
});
