import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { createHttpApp } from "../http-app.js";
import { runtimeConfig } from "../runtime-config.js";
import { db } from "../v1/store.js";
import { createRxNorm } from "../v1/rxnorm.js";
import { createTelegram } from "../v1/telegram.js";
import { createDoseWorker } from "../v1/doseReminders.js";
import {
  openFDAFixture,
  fixtureLabel,
} from "../../verification/step26/fixture.mjs";
import { runModule2Scenario } from "../../verification/step29/scenario.mjs";

test(
  "Step 29 one-patient A1/B1/A2/B2/C2 plus C1 regression on compiled same-origin app",
  { timeout: 60000 },
  async (t) => {
    await mongoose.connect(process.env.MONGODB_TEST_URI, {
      dbName: "module2_" + randomUUID().replaceAll("-", ""),
    });
    await db.init();
    let clock = new Date("2026-11-04T00:00:00Z"),
      server,
      base;
    const source = openFDAFixture(),
      telegram = createTelegram({ token: "", username: "" });
    const rxnorm = createRxNorm({
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
    async function start() {
      const http = createHttpApp({
        db,
        config: runtimeConfig({ NODE_ENV: "test", SERVE_CLIENT: "true" }),
        readiness: async () => true,
        services: {
          telegram,
          rxnorm,
          openfda: source.adapter,
          now: () => new Date(clock),
        },
      });
      server = http.finish().listen(0, "127.0.0.1");
      await new Promise((r) => server.once("listening", r));
      base = `http://127.0.0.1:${server.address().port}/api/v1`;
    }
    t.after(async () => {
      await new Promise((r) => server.close(r));
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    });
    await start();
    const report = await runModule2Scenario({
      getBase: () => base,
      now: () => new Date(clock),
      advanceTo: (d) => {
        clock = d;
      },
      queueDue: () =>
        createDoseWorker({
          db,
          telegram,
          now: () => new Date(clock),
        }).queueDue(),
      restart: async () => {
        await new Promise((r) => server.close(r));
        await start();
      },
      sourceOutage: (v) => {
        source.control.down = v;
      },
      originalLabel: (id) => fixtureLabel(id),
      mode: "Controlled fixtures; not a deployment",
    });
    assert.equal(report.checks.length, 8);
    assert.equal(
      await db.count("DoseAction", { patientId: report.records.patientId }),
      3,
    );
    assert.equal(
      await db.count("DoseReminderJob", {
        patientId: report.records.patientId,
        status: "disabled",
      }),
      3,
    );
    assert.equal(
      await db.count("DoseReminderAttempt", {
        patientId: report.records.patientId,
      }),
      0,
    );
  },
);
