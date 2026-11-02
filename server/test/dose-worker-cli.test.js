import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import express from "express";
import mongoose from "mongoose";
import { createV1 } from "../v1/app.js";
import { db } from "../v1/store.js";
import { createTelegram } from "../v1/telegram.js";
import {
  seedDoseSchedule,
  expectStatus as ok,
  syntheticPassword,
} from "../../verification/step27/fixture.mjs";

test(
  "C2 actual --once worker records disabled reminder requests without external messages",
  { timeout: 60000 },
  async (t) => {
    const dbName = "c2_cli_" + randomUUID().replaceAll("-", "");
    await mongoose.connect(process.env.MONGODB_TEST_URI, { dbName });
    await db.init();
    // Fixture clock creates valid A2 future events; the independent CLI's wall
    // clock then observes the first event as due, without waiting for a real dose.
    const creationTime = new Date(Date.now() - 120000),
      app = express();
    app.use(
      "/api/v1",
      createV1({
        db,
        telegram: createTelegram({ token: "", username: "" }),
        now: () => new Date(creationTime),
      }),
    );
    const server = app.listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    t.after(async () => {
      await new Promise((r) => server.close(r));
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    });
    const base = `http://127.0.0.1:${server.address().port}/api/v1`;
    let cookie = "",
      csrf = "";
    const c = {
      async call(method, path, body, key = randomUUID()) {
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
      },
    };
    await c.call("GET", "/auth/csrf");
    const a = ok(
        await c.call("POST", "/auth/register", {
          email: `cli-${randomUUID()}@example.test`,
          password: syntheticPassword,
          displayName: "Synthetic CLI reviewer",
        }),
        201,
      ),
      p = `/patients/${a.patientId}`;
    const seed = await seedDoseSchedule(
      c,
      p,
      creationTime,
      "CLI synthetic medicine",
    );
    ok(
      await c.call("PUT", p + "/dose-reminder-settings", {
        expectedRevision: null,
        enabled: true,
        consent: true,
      }),
    );
    const uri = new URL(process.env.MONGODB_TEST_URI);
    uri.pathname = "/" + dbName;
    const child = spawn(process.execPath, ["server/dose-worker.js", "--once"], {
      cwd: new URL("../../", import.meta.url),
      env: {
        ...process.env,
        MONGODB_URI: uri.toString(),
        TELEGRAM_BOT_TOKEN: "",
        TELEGRAM_BOT_USERNAME: "",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (b) => {
      output += b;
    });
    child.stderr.on("data", (b) => {
      output += b;
    });
    const code = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", resolve);
    });
    assert.equal(code, 0, output);
    assert.ok(output.includes('"telegramConfigured":false'));
    const jobs = await db.list(
      "DoseReminderJob",
      { occurrenceId: seed.occurrences[0].id },
      10,
    );
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].status, "disabled");
    assert.equal(jobs[0].attemptCount, 0);
    assert.equal(
      (await db.one("DoseOccurrence", { _id: seed.occurrences[0].id })).state,
      "pending",
    );
    assert.ok(
      (await db.one("WorkerState", { name: "dose-reminders" })).lastActiveAt,
    );
  },
);
