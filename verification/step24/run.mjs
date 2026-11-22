import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";
import { createV1 } from "../../server/v1/app.js";
import { db } from "../../server/v1/store.js";
import { createRxNorm } from "../../server/v1/rxnorm.js";
import { createTelegram } from "../../server/v1/telegram.js";
import { module1RxNormFixture } from "./fixture.mjs";
import { runModule1Scenario } from "./scenario.mjs";
const requireServer = createRequire(
    new URL("../../server/package.json", import.meta.url),
  ),
  requireTests = createRequire(
    new URL("../step18/package.json", import.meta.url),
  );
const mongoose = requireServer("mongoose"),
  express = requireServer("express"),
  { MongoMemoryReplSet } = requireTests("mongodb-memory-server");
const args = process.argv.slice(2),
  live = args.includes("--live-rxnorm"),
  outputIndex = args.indexOf("--output");
if (
  args.some(
    (v, i) =>
      v !== "--live-rxnorm" &&
      v !== "--output" &&
      !(outputIndex >= 0 && i === outputIndex + 1),
  ) ||
  (outputIndex >= 0 && !args[outputIndex + 1])
)
  throw Error(
    "Usage: node verification/step24/run.mjs [--live-rxnorm] [--output path.json]",
  );
const externalRequests = [],
  controlledFaults = [];
const rxnorm = live
  ? createRxNorm({
      fetchImpl: async (url, options) => {
        if (url.includes("module1-deliberate-outage")) {
          controlledFaults.push({ kind: "RxNorm outage", testOnly: true });
          throw Error("Controlled test-only RxNorm outage");
        }
        const r = await fetch(url, options),
          payload = await r.clone().json();
        externalRequests.push({
          at: new Date().toISOString(),
          url,
          status: r.status,
          payload,
        });
        return r;
      },
    })
  : module1RxNormFixture();
const replica = await MongoMemoryReplSet.create({
  binary: { version: "7.0.24" },
  ...(process.env.MONGOMS_DB_PATH
    ? { instanceOpts: [{ dbPath: process.env.MONGOMS_DB_PATH }] }
    : {}),
  replSet: { count: 1 },
});
let server, base;
async function start() {
  const app = express();
  app.use(
    "/api/v1",
    createV1({
      db,
      rxnorm,
      telegram: createTelegram({ token: "", username: "" }),
    }),
  );
  server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}/api/v1`;
}
try {
  await mongoose.connect(replica.getUri(), {
    dbName: "module1_disposable_synthetic",
  });
  await db.init();
  await start();
  const report = await runModule1Scenario({
    getBase: () => base,
    upstreamMode: live
      ? "live NLM RxNorm with explicitly injected test-only outage"
      : "controlled RxNorm fixture; no live external claim",
    restart: async () => {
      await new Promise((r) => server.close(r));
      await start();
    },
  });
  report.externalRequests = externalRequests;
  report.controlledFaults = live
    ? controlledFaults
    : [{ kind: "RxNorm outage", testOnly: true }];
  report.databaseCounts = {};
  for (const model of [
    "Prescription",
    "PrescriptionVersion",
    "PrescriptionInstruction",
    "CabinetItem",
    "CabinetRevision",
    "Task",
    "TaskEvent",
    "NotificationJob",
  ])
    report.databaseCounts[model] = await mongoose
      .model(model)
      .countDocuments({ patientId: report.records.patientId });
  const serialized = JSON.stringify(report, null, 2) + "\n";
  if (outputIndex >= 0) await writeFile(args[outputIndex + 1], serialized);
  console.log(serialized);
} finally {
  if (server) await new Promise((r) => server.close(r));
  await mongoose.disconnect();
  await replica.stop();
}
