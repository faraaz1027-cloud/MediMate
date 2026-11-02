import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import express from "express";
import mongoose from "mongoose";
import { createV1 } from "../v1/app.js";
import { db } from "../v1/store.js";
import { module1RxNormFixture } from "../../verification/step24/fixture.mjs";
import { createTelegram } from "../v1/telegram.js";
import { runModule1Scenario } from "../../verification/step24/scenario.mjs";

test(
  "Step 24 one-patient A1/B1/C1 integration, reference scope, revocation and restart",
  { timeout: 90000 },
  async (t) => {
    assert.ok(process.env.MONGODB_TEST_URI);
    await mongoose.connect(process.env.MONGODB_TEST_URI, {
      dbName: "module1_" + randomUUID().replaceAll("-", ""),
      serverSelectionTimeoutMS: 5000,
    });
    await db.init();
    let server, base;
    const rxnorm = module1RxNormFixture();
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
    await start();
    t.after(async () => {
      await new Promise((r) => server.close(r));
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    });
    const report = await runModule1Scenario({
      getBase: () => base,
      upstreamMode: "controlled RxNorm fixture; Telegram disabled",
      restart: async () => {
        await new Promise((r) => server.close(r));
        await start();
      },
    });
    assert.equal(report.checks.length, 9);
    for (const model of ["Prescription", "CabinetItem", "Task"]) {
      const expected = model === "Task" ? 1 : 2;
      assert.equal(
        await mongoose
          .model(model)
          .countDocuments({ patientId: report.records.patientId }),
        expected,
      );
    }
    const instructions = await mongoose
      .model("PrescriptionInstruction")
      .find({ patientId: report.records.patientId })
      .lean();
    assert.ok(
      instructions.every((i) =>
        report.records.cabinetItemIds.includes(String(i.cabinetItemId)),
      ),
    );
  },
);
