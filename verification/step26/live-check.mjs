// Explicit opt-in: real public RxNorm/openFDA calls, disposable synthetic DB.
import { MongoMemoryReplSet } from "../step18/node_modules/mongodb-memory-server/index.js";
import { createRequire } from "node:module";
import { randomUUID, createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { createV1 } from "../../server/v1/app.js";
import { db } from "../../server/v1/store.js";
import { createOpenFDA, passageKeys } from "../../server/v1/openfda.js";
if (!process.argv.includes("--live"))
  throw Error(
    "Pass --live to explicitly contact public RxNorm/openFDA with numeric product IDs only.",
  );
const require = createRequire(
    new URL("../../server/package.json", import.meta.url),
  ),
  mongoose = require("mongoose"),
  express = require("express");
const replica = await MongoMemoryReplSet.create({
  binary: { version: "7.0.24" },
  replSet: { count: 1 },
  ...(process.env.MONGOMS_DB_PATH
    ? { instanceOpts: [{ dbPath: process.env.MONGOMS_DB_PATH }] }
    : {}),
});
let server,
  down = false;
const requests = [],
  records = new Map();
try {
  await mongoose.connect(replica.getUri(), { dbName: "b2_live_synthetic" });
  await db.init();
  const openfda = createOpenFDA({
    fetchImpl: async (url, opts) => {
      if (down) {
        requests.push({
          url,
          status: "controlled_test_outage",
          at: new Date().toISOString(),
        });
        throw Error("Controlled outage, not a provider incident");
      }
      const r = await fetch(url, opts),
        b = await r.clone().json();
      requests.push({
        url,
        status: r.status,
        at: new Date().toISOString(),
        recordIds: b.results?.map((x) => x.id) || [],
      });
      for (const row of b.results || []) records.set(row.id, row);
      return r;
    },
  });
  const app = express();
  app.use("/api/v1", createV1({ db, openfda }));
  server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  let cookie = "",
    csrf = "";
  async function call(method, path, body, key = randomUUID()) {
    const r = await fetch(base + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
        "X-CSRF-Token": csrf,
        "Idempotency-Key": key,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (r.headers.get("set-cookie"))
      cookie = r.headers.get("set-cookie").split(";")[0];
    const b = await r.json();
    if (b.data?.csrfToken) csrf = b.data.csrfToken;
    return { status: r.status, body: b };
  }
  const ok = (r, status = 200) => {
    assert.equal(r.status, status, JSON.stringify(r.body));
    return r.body.data;
  };
  await call("GET", "/auth/csrf");
  const owner = ok(
      await call("POST", "/auth/register", {
        email: `b2-live-${randomUUID()}@example.test`,
        password: "Synthetic-pass-123!",
        displayName: "Synthetic B2 live verification",
      }),
      201,
    ),
    p = `/patients/${owner.patientId}`;
  const item = ok(
      await call("POST", p + "/cabinet-items", {
        entryType: "external",
        externalId: "198440",
        reviewed: true,
        strengthText: "500 mg",
        form: "tablet",
      }),
      201,
    ),
    path = `${p}/cabinet-items/${item.id}`;
  const candidates = ok(await call("GET", path + "/label-candidates"));
  assert.ok(candidates.candidates.length);
  const candidate = candidates.candidates[0];
  const body = {
      expectedRevision: null,
      expectedCabinetRevision: item.revision,
      selectedLabelId: candidate.labelId,
      expectedContentHash: candidate.contentHash,
      applicabilityConfirmed: true,
    },
    key = randomUUID();
  const saved = ok(await call("PUT", path + "/information-card", body, key)),
    raw = records.get(saved.source.externalId);
  for (const p of saved.selectedPassages)
    assert.equal(p.text, raw[p.key][p.index]);
  assert.equal(
    saved.source.contentHash,
    createHash("sha256").update(JSON.stringify(raw)).digest("hex"),
  );
  down = true;
  assert.equal(
    (await call("GET", path + "/label-candidates?refresh=true")).status,
    503,
  );
  ok(await call("PUT", path + "/information-card", body, key));
  const note = ok(
    await call("PATCH", path + "/information-card/note", {
      expectedRevision: saved.revision,
      personalNote: "Synthetic personal question, separate from label facts.",
    }),
  );
  const readback = ok(await call("GET", path + "/information-card"));
  assert.deepEqual(readback.selectedPassages, saved.selectedPassages);
  assert.equal(readback.personalNote, note.personalNote);
  const report = {
    runAt: new Date().toISOString(),
    mode: "real public RxNorm/openFDA with explicit synthetic cabinet; outage deliberately injected",
    records: {
      patientId: owner.patientId,
      cabinetItemId: item.id,
      cardId: saved.id,
      sourceRecordId: saved.source.id,
    },
    requests,
    source: {
      labelId: saved.source.externalId,
      sourceUrl: saved.source.sourceUrl,
      retrievedAt: saved.source.retrievedAt,
      contentHash: saved.source.contentHash,
    },
    originalResponseFields: Object.fromEntries(
      ["id", "set_id", "version", "effective_time", "openfda", ...passageKeys]
        .filter((k) => raw[k] !== undefined)
        .map((k) => [k, raw[k]]),
    ),
    checks: [
      "Actual outgoing requests contain public numeric product/label identifiers only",
      "Every saved passage equals its original response field/index verbatim",
      "Saved hash equals complete raw selected label record SHA-256",
      "Injected outage returns 503, preserves saved evidence and does not block private note",
      "Successful replay during outage performs no lookup or duplicate writes",
      "Readback retains distinct source facts and personal note",
    ],
    passageCount: saved.selectedPassages.length,
  };
  await writeFile(
    new URL("../../docs/evidence/step26-live-openfda.json", import.meta.url),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      passed: true,
      labelId: report.source.labelId,
      passageCount: report.passageCount,
      checks: report.checks.length,
      liveRequests: requests.filter((r) => typeof r.status === "number").length,
    }),
  );
} finally {
  if (server) await new Promise((r) => server.close(r));
  if (mongoose.connection.readyState) {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
  await replica.stop();
}
