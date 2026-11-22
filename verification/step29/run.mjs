// Local synthetic rehearsal. --live-sources opts into public product lookups.
// It never uses cloud credentials or constructs an enabled Telegram adapter.
import { MongoMemoryReplSet } from "../step18/node_modules/mongodb-memory-server/index.js";
import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";
import { createHttpApp } from "../../server/http-app.js";
import { runtimeConfig } from "../../server/runtime-config.js";
import { db } from "../../server/v1/store.js";
import { createRxNorm } from "../../server/v1/rxnorm.js";
import { createOpenFDA } from "../../server/v1/openfda.js";
import { createTelegram } from "../../server/v1/telegram.js";
import { createDoseWorker } from "../../server/v1/doseReminders.js";
import { openFDAFixture, fixtureLabel } from "../step26/fixture.mjs";
import { runModule2Scenario } from "./scenario.mjs";
import assert from "node:assert/strict";
const require = createRequire(
    new URL("../../server/package.json", import.meta.url),
  ),
  mongoose = require("mongoose");
const serve = process.argv.includes("--serve"),
  live = process.argv.includes("--live-sources");
const replica = await MongoMemoryReplSet.create({
  binary: { version: "7.0.24" },
  replSet: { count: 1, args: ["--setParameter", "ttlMonitorEnabled=false"] },
  ...(process.env.MONGOMS_DB_PATH
    ? { instanceOpts: [{ dbPath: process.env.MONGOMS_DB_PATH }] }
    : {}),
});
let server,
  base,
  down = false,
  closed = false;
const clock = new Date();
clock.setUTCHours(0, 0, 0, 0);
clock.setUTCDate(clock.getUTCDate() + 1);
let current = clock;
const requests = [],
  originals = new Map(),
  fixture = openFDAFixture();
const telegram = createTelegram({ token: "", username: "" });
const rxnorm = live
  ? createRxNorm({
      fetchImpl: async (url, opts) => {
        const r = await fetch(url, opts);
        requests.push({
          provider: "RxNorm",
          url,
          status: r.status,
          at: new Date().toISOString(),
        });
        return r;
      },
    })
  : createRxNorm({
      spacingMs: 0,
      fetchImpl: async () =>
        Response.json({
          properties: {
            rxcui: "198440",
            name: "Synthetic Module 2 product 500 MG Oral Tablet",
            tty: "SCD",
            suppress: "N",
          },
        }),
    });
const openfda = live
  ? createOpenFDA({
      fetchImpl: async (url, opts) => {
        if (down) {
          requests.push({
            provider: "openFDA",
            status: "controlled_test_outage",
          });
          throw Error("Synthetic outage");
        }
        const r = await fetch(url, opts),
          b = await r.clone().json();
        requests.push({
          provider: "openFDA",
          url,
          status: r.status,
          at: new Date().toISOString(),
        });
        for (const row of b.results || []) originals.set(row.id, row);
        return r;
      },
    })
  : fixture.adapter;
async function start() {
  const config = runtimeConfig({
    NODE_ENV: "development",
    SERVE_CLIENT: "true",
  });
  const http = createHttpApp({
    db,
    config,
    readiness: async () => mongoose.connection.readyState === 1,
    services: { telegram, rxnorm, openfda, now: () => new Date(current) },
  });
  server = http.finish().listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
  // Origin is the exact local listener, not an arbitrary cross-site frontend.
  config.origins.push(base);
}
async function close() {
  if (closed) return;
  closed = true;
  if (server) await new Promise((r) => server.close(r));
  if (mongoose.connection.readyState) {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
  await replica.stop();
}
try {
  await mongoose.connect(replica.getUri(), {
    dbName: "module2_step29_synthetic",
  });
  await db.init();
  await start();
  const report = await runModule2Scenario({
    getBase: () => base + "/api/v1",
    now: () => new Date(current),
    advanceTo: (d) => {
      current = d;
    },
    queueDue: () =>
      createDoseWorker({
        db,
        telegram,
        now: () => new Date(current),
      }).queueDue(),
    restart: async () => {
      await new Promise((r) => server.close(r));
      await start();
    },
    sourceOutage: (value) => {
      down = value;
      fixture.control.down = value;
    },
    originalLabel: (id) => (live ? originals.get(id) : fixtureLabel(id)),
    mode: live
      ? "Real public RxNorm/openFDA; controlled source outage; Telegram explicitly disabled"
      : "Controlled source fixtures; Telegram explicitly disabled; local-only rehearsal",
  });
  const patientId = report.records.patientId;
  report.database = {
    doses: await db.count("DoseOccurrence", { patientId }),
    doseActions: await db.count("DoseAction", { patientId }),
    medicineCards: await db.count("MedicineCard", { patientId }),
    reminderJobs: await db.count("DoseReminderJob", { patientId }),
    reminderAttempts: await db.count("DoseReminderAttempt", { patientId }),
    stockTransactions: await mongoose.connection.db
      .collection("stockTransactions")
      .countDocuments({ patientId: new mongoose.Types.ObjectId(patientId) }),
  };
  assert.equal(report.database.doseActions, 3);
  assert.equal(report.database.doses, 12);
  assert.equal(report.database.reminderAttempts, 0);
  assert.equal(report.database.stockTransactions, 0);
  report.requests = requests;
  report.realTelegramVerified = false;
  report.publicDeploymentVerified = false;
  report.facultyLocalAcceptanceVerified = false;
  const file = live
    ? "step29-module2-live-sources.json"
    : "step29-module2-controlled.json";
  await writeFile(
    new URL("../../docs/evidence/" + file, import.meta.url),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      passed: true,
      mode: report.mode,
      checks: report.checks.length,
      database: report.database,
      liveRequests: requests.filter((r) => typeof r.status === "number").length,
      evidence: "docs/evidence/" + file,
    }),
  );
  if (serve) {
    console.log("Local synthetic rehearsal: " + base);
    console.log(
      "Synthetic login: module2-owner@example.test / Synthetic-pass-123!",
    );
    console.log(
      "Fixture clock: " +
        current.toISOString() +
        "; stop with Ctrl+C. This is not a public deployment.",
    );
    await new Promise((resolve) => {
      process.once("SIGINT", resolve);
      process.once("SIGTERM", resolve);
    });
  }
} finally {
  await close();
}
