import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import express from "express";
import mongoose from "mongoose";
import { createV1 } from "../v1/app.js";
import { db } from "../v1/store.js";
import { createDoseWorker } from "../v1/doseReminders.js";
import { TelegramError } from "../v1/telegram.js";
import {
  seedDoseSchedule,
  expectStatus as ok,
  syntheticPassword,
} from "../../verification/step27/fixture.mjs";

test(
  "Step 27 C2 real HTTP/MongoDB actions and controlled reminder worker",
  { timeout: 90000 },
  async (t) => {
    await mongoose.connect(process.env.MONGODB_TEST_URI, {
      dbName: "c2_" + randomUUID().replaceAll("-", ""),
    });
    await db.init();
    let clock = new Date("2026-11-03T01:00:00Z"),
      server,
      base,
      mode = "sent",
      sends = 0;
    const now = () => new Date(clock);
    const telegram = {
      enabled: true,
      username: "Synthetic_Test_Bot",
      updates: async () => [],
      sendDoseNotice: async () => {
        sends++;
        if (mode === "blocked") throw new TelegramError("RECIPIENT_BLOCKED");
        if (mode === "unknown")
          throw new TelegramError("OUTCOME_UNKNOWN", true);
        return { messageId: String(sends) };
      },
    };
    let worker = createDoseWorker({ db, telegram, now });
    async function start() {
      const app = express();
      app.use("/api/v1", createV1({ db, telegram, now }));
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
    const client = () => ({
      cookie: "",
      csrf: "",
      async call(method, path, body, key = randomUUID()) {
        const r = await fetch(base + path, {
          method,
          headers: {
            "Content-Type": "application/json",
            Cookie: this.cookie,
            "X-CSRF-Token": this.csrf,
            "Idempotency-Key": key,
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        if (r.headers.get("set-cookie"))
          this.cookie = r.headers.get("set-cookie").split(";")[0];
        const b = await r.json();
        if (b.data?.csrfToken) this.csrf = b.data.csrfToken;
        return { status: r.status, body: b };
      },
    });
    async function register(c, name) {
      await c.call("GET", "/auth/csrf");
      return ok(
        await c.call("POST", "/auth/register", {
          email: name + "@example.test",
          password: syntheticPassword,
          displayName: name,
        }),
        201,
      );
    }
    const owner = client(),
      caregiver = client(),
      stranger = client(),
      a = await register(owner, "C2Owner"),
      b = await register(caregiver, "C2Caregiver");
    await register(stranger, "C2Stranger");
    const p = `/patients/${a.patientId}`,
      seed = await seedDoseSchedule(owner, p, clock);
    clock = new Date(seed.start.getTime() + 25 * 60000);
    const route = (d) => `${p}/doses/${d.id}`,
      action = (c, path, body, key = randomUUID()) =>
        c.call("POST", path, { ...body, clientRequestId: key }, key);
    let first = seed.occurrences[0],
      second = seed.occurrences[1],
      third = seed.occurrences[2];
    await t.test(
      "local-day listing, complete counts, half-open range, history pagination and future/foreign validation",
      async () => {
        const r = await owner.call("GET", p + "/doses?date=2026-11-03&limit=2");
        ok(r);
        assert.equal(r.body.data.length, 2);
        assert.equal(r.body.meta.summary.pending, 12);
        assert.equal(r.body.meta.fromUTC, "2026-11-02T18:00:00.000Z");
        assert.ok(r.body.meta.nextCursor);
        const next = ok(
          await owner.call(
            "GET",
            p +
              "/doses?date=2026-11-03&limit=2&cursor=" +
              r.body.meta.nextCursor,
          ),
        );
        assert.ok(next.every((x) => !r.body.data.some((y) => y.id === x.id)));
        const end = new Date(Date.parse(first.dueAtUTC) + 1).toISOString(),
          half = ok(
            await owner.call(
              "GET",
              `${p}/doses?fromUTC=${first.dueAtUTC}&toUTC=${end}`,
            ),
          );
        assert.equal(half.length, 1);
        assert.equal(
          (await owner.call("GET", p + "/doses?date=2026-02-30")).status,
          422,
        );
        assert.equal(
          (
            await owner.call(
              "GET",
              p + "/doses?date=2026-11-03&timezone=Bad/Zone",
            )
          ).status,
          422,
        );
        assert.equal((await stranger.call("GET", route(first))).status, 404);
        assert.equal(
          (
            await action(owner, route(seed.occurrences.at(-1)) + "/actions", {
              expectedRevision: 0,
              action: "taken",
            })
          ).body.error.code,
          "DOSE_NOT_DUE",
        );
        assert.equal(
          (
            await action(owner, route(third) + "/actions", {
              expectedRevision: 0,
              action: "taken",
              effectiveAt: new Date(clock.getTime() + 1).toISOString(),
            })
          ).status,
          422,
        );
        const invalidId = await owner.call("POST", route(third) + "/actions", {
          expectedRevision: 0,
          action: "taken",
          clientRequestId: randomUUID(),
        });
        assert.equal(invalidId.status, 422);
      },
    );
    await t.test(
      "concurrent terminal actions create one effective record; successful replay adds no second action or stock effect",
      async () => {
        const key = randomUUID(),
          body = { expectedRevision: 0, action: "taken", clientRequestId: key };
        const both = await Promise.all([
          owner.call("POST", route(first) + "/actions", body, key),
          owner.call("POST", route(first) + "/actions", body, key),
        ]);
        both.forEach((r) => ok(r));
        first = both[0].body.data.dose;
        assert.equal(first.state, "taken");
        assert.equal(first.actionRevision, 1);
        assert.equal(
          await mongoose
            .model("DoseAction")
            .countDocuments({ occurrenceId: first.id }),
          1,
        );
        assert.equal(
          (
            await action(owner, route(first) + "/actions", {
              expectedRevision: 1,
              action: "skipped",
            })
          ).body.error.code,
          "DOSE_ALREADY_RECORDED",
        );
        assert.equal(
          await mongoose.connection
            .collection("stockTransactions")
            .countDocuments(),
          0,
        );
        const rival = await Promise.all([
          action(owner, route(third) + "/actions", {
            expectedRevision: 0,
            action: "taken",
          }),
          action(owner, route(third) + "/actions", {
            expectedRevision: 0,
            action: "skipped",
          }),
        ]);
        assert.deepEqual(rival.map((r) => r.status).sort(), [200, 409]);
        assert.equal(
          await mongoose
            .model("DoseAction")
            .countDocuments({ occurrenceId: third.id }),
          1,
        );
      },
    );
    await t.test(
      "three bounded snoozes change reminder only, deduplicate and permit terminal recording before deferred notice",
      async () => {
        const originalDue = second.dueAtUTC,
          key = randomUUID(),
          body = { expectedRevision: 0, minutes: 10, clientRequestId: key };
        second = ok(
          await owner.call("POST", route(second) + "/snoozes", body, key),
        ).dose;
        ok(await owner.call("POST", route(second) + "/snoozes", body, key));
        assert.equal(second.dueAtUTC, originalDue);
        assert.equal(second.state, "pending");
        assert.equal(second.snoozeCount, 1);
        assert.equal(
          (
            await action(owner, route(second) + "/snoozes", {
              expectedRevision: 1,
              minutes: 10,
            })
          ).body.error.code,
          "ALREADY_SNOOZED",
        );
        for (let i = 0; i < 2; i++) {
          clock = new Date(second.reminderDueAtUTC);
          second = ok(
            await action(owner, route(second) + "/snoozes", {
              expectedRevision: second.actionRevision,
              minutes: 10,
            }),
          ).dose;
        }
        clock = new Date(second.reminderDueAtUTC);
        assert.equal(
          (
            await action(owner, route(second) + "/snoozes", {
              expectedRevision: second.actionRevision,
              minutes: 10,
            })
          ).body.error.code,
          "SNOOZE_LIMIT",
        );
        second = ok(
          await action(owner, route(second) + "/actions", {
            expectedRevision: second.actionRevision,
            action: "skipped",
          }),
        ).dose;
        assert.equal(second.state, "skipped");
        assert.equal(second.dueAtUTC, originalDue);
      },
    );
    await t.test(
      "reasoned corrections retain prior actors/times/history and cancelled A2 events cannot be acted on",
      async () => {
        assert.equal(
          (
            await action(owner, route(first) + "/corrections", {
              expectedRevision: first.actionRevision,
              newState: "pending",
              reason: " ",
            })
          ).status,
          422,
        );
        first = ok(
          await action(owner, route(first) + "/corrections", {
            expectedRevision: first.actionRevision,
            newState: "pending",
            reason: "Synthetic correction",
          }),
        ).dose;
        assert.equal(first.state, "pending");
        const history = ok(await owner.call("GET", route(first)));
        assert.equal(history.actions.length, 2);
        assert.equal(history.actions[1].action, "taken");
        assert.equal(history.actions[0].isCorrection, true);
        first = ok(
          await action(owner, route(first) + "/actions", {
            expectedRevision: first.actionRevision,
            action: "taken",
          }),
        ).dose;
        const cancelled = seed.occurrences.at(-1);
        ok(
          await owner.call("POST", `${p}/schedules/${seed.schedule.id}/pause`, {
            expectedRevision: seed.schedule.revision,
          }),
        );
        assert.equal(
          (
            await action(owner, route(cancelled) + "/actions", {
              expectedRevision: 0,
              action: "taken",
            })
          ).body.error.code,
          "DOSE_CANCELLED",
        );
        const page = await owner.call("GET", route(first) + "/actions?limit=1");
        ok(page);
        assert.ok(page.body.meta.nextCursor);
        assert.equal(
          ok(
            await owner.call(
              "GET",
              route(first) +
                "/actions?limit=1&cursor=" +
                page.body.meta.nextCursor,
            ),
          ).length,
          1,
        );
      },
    );
    await t.test(
      "patient/dose permissions, caregiver actor, CSRF and revocation also protect replay and reminder consent",
      async () => {
        let grant = ok(
            await owner.call("POST", p + "/access-grants", {
              userId: b.user.id,
              permissions: ["dose.read", "dose.record"],
            }),
            201,
          ),
          d = seed.occurrences[4],
          key = randomUUID(),
          body = { expectedRevision: 0, action: "taken", clientRequestId: key };
        const reply = ok(
          await caregiver.call("POST", route(d) + "/actions", body, key),
        );
        assert.equal(
          ok(await caregiver.call("GET", route(d))).actions[0].actorUserId,
          b.user.id,
        );
        assert.equal(
          (
            await caregiver.call("PUT", p + "/dose-reminder-settings", {
              expectedRevision: null,
              enabled: true,
              consent: true,
            })
          ).status,
          403,
        );
        grant = ok(
          await owner.call("PATCH", `${p}/access-grants/${grant.id}`, {
            expectedRevision: grant.revision,
            permissions: ["dose.read"],
          }),
        );
        assert.equal(
          (await caregiver.call("POST", route(d) + "/actions", body, key))
            .status,
          403,
        );
        ok(
          await owner.call("POST", `${p}/access-grants/${grant.id}/revoke`, {
            expectedRevision: grant.revision,
          }),
        );
        assert.equal((await caregiver.call("GET", route(d))).status, 404);
        assert.equal(
          (await caregiver.call("POST", route(d) + "/actions", body, key))
            .status,
          404,
        );
        const other = ok(
          await owner.call("POST", "/patients", {
            displayName: "Other C2",
            timezone: "UTC",
          }),
          201,
        );
        assert.equal(
          (await owner.call("GET", `/patients/${other.id}/doses/${d.id}`))
            .status,
          404,
        );
        const csrf = owner.csrf;
        owner.csrf = "invalid";
        assert.equal(
          (
            await action(owner, route(d) + "/actions", {
              expectedRevision: reply.dose.actionRevision,
              action: "taken",
            })
          ).status,
          403,
        );
        owner.csrf = csrf;
      },
    );
    await t.test(
      "action transaction failure rolls back dose, immutable action and pending reminder suppression",
      async () => {
        const d = seed.occurrences[5],
          original = db.insert;
        db.insert = async (name, ...args) => {
          if (name === "DoseAction") throw Error("Injected action failure");
          return original(name, ...args);
        };
        try {
          assert.equal(
            (
              await action(owner, route(d) + "/actions", {
                expectedRevision: 0,
                action: "taken",
              })
            ).status,
            503,
          );
        } finally {
          db.insert = original;
        }
        const unchanged = ok(await owner.call("GET", route(d)));
        assert.equal(unchanged.dose.state, "pending");
        assert.equal(unchanged.actions.length, 0);
      },
    );
    let link;
    async function freshReminderPatient(label) {
      const patient = ok(
          await owner.call("POST", "/patients", {
            displayName: label,
            timezone: "Asia/Dhaka",
          }),
          201,
        ),
        path = `/patients/${patient.id}`,
        data = await seedDoseSchedule(owner, path, clock, label);
      clock = new Date(data.start.getTime() + 1000);
      assert.equal(
        ok(await owner.call("GET", path + "/dose-reminder-settings")).enabled,
        false,
      );
      assert.equal(
        (
          await owner.call("PUT", path + "/dose-reminder-settings", {
            expectedRevision: null,
            enabled: true,
          })
        ).status,
        422,
      );
      const settings = ok(
        await owner.call("PUT", path + "/dose-reminder-settings", {
          expectedRevision: null,
          enabled: true,
          consent: true,
        }),
      );
      return { path, data, settings, dose: data.occurrences[0] };
    }
    async function disable(ctx) {
      const pref = ok(
        await owner.call("GET", ctx.path + "/dose-reminder-settings"),
      );
      ok(
        await owner.call("PUT", ctx.path + "/dose-reminder-settings", {
          expectedRevision: pref.revision,
          enabled: false,
        }),
      );
    }
    await t.test(
      "unconfigured jobs are explicit and separate; queue concurrency/restart cannot duplicate them",
      async () => {
        telegram.enabled = false;
        const ctx = await freshReminderPatient("C2 disabled fixture");
        const before = sends;
        await Promise.all([worker.queueDue(), worker.queueDue()]);
        assert.equal(
          await mongoose
            .model("DoseReminderJob")
            .countDocuments({ patientId: ctx.data.schedule.patientId }),
          1,
        );
        let detail = ok(
          await owner.call("GET", `${ctx.path}/doses/${ctx.dose.id}`),
        );
        assert.equal(detail.reminders[0].status, "disabled");
        assert.equal(detail.reminders[0].attemptCount, 0);
        assert.equal(detail.dose.state, "pending");
        worker = createDoseWorker({ db, telegram, now });
        await worker.queueDue();
        assert.equal(await worker.deliverOne(), false);
        assert.equal(sends, before);
        await disable(ctx);
        telegram.enabled = true;
      },
    );
    await t.test(
      "channel acceptance is separate from dose state; two workers claim once and sent/unknown are never retried",
      async () => {
        link = await db.insert("ChannelLink", {
          userId: a.user.id,
          telegramUserId: "910000001",
          chatId: "910000001",
          consentedAt: now(),
          revokedAt: null,
        });
        const ctx = await freshReminderPatient("C2 accepted fixture");
        await worker.queueDue();
        const before = sends;
        await Promise.all([worker.deliverOne(), worker.deliverOne()]);
        assert.equal(sends, before + 1);
        const detail = ok(
          await owner.call("GET", `${ctx.path}/doses/${ctx.dose.id}`),
        );
        assert.equal(detail.dose.state, "pending");
        assert.equal(detail.actions.length, 0);
        assert.equal(detail.reminders[0].status, "sent");
        assert.equal(
          detail.reminders[0].attempts[0].status,
          "accepted_by_channel",
        );
        assert.equal(
          (
            await owner.call(
              "POST",
              `${ctx.path}/doses/${ctx.dose.id}/reminders/${detail.reminders[0].id}/retry`,
              { expectedRevision: detail.reminders[0].revision },
            )
          ).status,
          409,
        );
        await disable(ctx);
      },
    );
    await t.test(
      "definite failure has bounded explicit retry; snooze supersedes old jobs without changing due time",
      async () => {
        const ctx = await freshReminderPatient("C2 failed fixture");
        mode = "blocked";
        await worker.queueDue();
        await worker.deliverOne();
        let detail = ok(
            await owner.call("GET", `${ctx.path}/doses/${ctx.dose.id}`),
          ),
          job = detail.reminders[0];
        assert.equal(job.status, "failed");
        assert.equal(job.errorCode, "RECIPIENT_BLOCKED");
        assert.equal(detail.dose.state, "pending");
        for (let i = 0; i < 2; i++) {
          ok(
            await owner.call(
              "POST",
              `${ctx.path}/doses/${ctx.dose.id}/reminders/${job.id}/retry`,
              { expectedRevision: job.revision },
            ),
          );
          await worker.deliverOne();
          job = ok(await owner.call("GET", `${ctx.path}/doses/${ctx.dose.id}`))
            .reminders[0];
        }
        assert.equal(job.attemptCount, 3);
        assert.equal(
          (
            await owner.call(
              "POST",
              `${ctx.path}/doses/${ctx.dose.id}/reminders/${job.id}/retry`,
              { expectedRevision: job.revision },
            )
          ).status,
          409,
        );
        const snoozed = ok(
          await action(owner, `${ctx.path}/doses/${ctx.dose.id}/snoozes`, {
            expectedRevision: 0,
            minutes: 10,
          }),
        ).dose;
        assert.equal(snoozed.dueAtUTC, ctx.dose.dueAtUTC);
        assert.equal(snoozed.state, "pending");
        clock = new Date(snoozed.reminderDueAtUTC);
        mode = "sent";
        await worker.queueDue();
        for (let i = 0; i < 20; i++) if (!(await worker.deliverOne())) break;
        detail = ok(
          await owner.call("GET", `${ctx.path}/doses/${ctx.dose.id}`),
        );
        assert.equal(detail.reminders.length, 2);
        assert.equal(detail.reminders[0].actionRevision, 1);
        assert.equal(detail.reminders[0].status, "sent");
        await disable(ctx);
      },
    );
    await t.test(
      "unknown result and interrupted lease preserve uncertainty without automatic resend",
      async () => {
        const ctx = await freshReminderPatient("C2 unknown fixture");
        mode = "unknown";
        await worker.queueDue();
        const before = sends;
        await worker.deliverOne();
        assert.equal(sends, before + 1);
        let detail = ok(
          await owner.call("GET", `${ctx.path}/doses/${ctx.dose.id}`),
        );
        assert.equal(detail.reminders[0].status, "unknown");
        await worker.deliverOne();
        assert.equal(sends, before + 1);
        assert.equal(
          (
            await owner.call(
              "POST",
              `${ctx.path}/doses/${ctx.dose.id}/reminders/${detail.reminders[0].id}/retry`,
              { expectedRevision: detail.reminders[0].revision },
            )
          ).status,
          409,
        );
        await disable(ctx);
        const crash = await freshReminderPatient("C2 interrupted fixture");
        await worker.queueDue();
        const j = await db.one("DoseReminderJob", {
          occurrenceId: crash.dose.id,
        });
        await db.update(
          "DoseReminderJob",
          { _id: j._id },
          {
            status: "processing",
            attemptCount: 1,
            leaseUntil: new Date(clock.getTime() - 1),
          },
        );
        await db.insert("DoseReminderAttempt", {
          patientId: j.patientId,
          jobId: j._id,
          attemptNumber: 1,
          attemptedAt: now(),
          status: "attempted",
        });
        worker = createDoseWorker({ db, telegram, now });
        await worker.deliverOne();
        detail = ok(
          await owner.call("GET", `${crash.path}/doses/${crash.dose.id}`),
        );
        assert.equal(detail.reminders[0].status, "unknown");
        assert.equal(
          detail.reminders[0].attempts[0].errorCode,
          "WORKER_INTERRUPTED",
        );
        assert.equal(sends, before + 1);
        await disable(crash);
        mode = "sent";
      },
    );
    await t.test(
      "consent unlink/pause/terminal changes suppress a queued notice; old jobs expire without auto-skipping",
      async () => {
        const ctx = await freshReminderPatient("C2 unlink fixture");
        await worker.queueDue();
        await db.update("ChannelLink", { _id: link._id }, { revokedAt: now() });
        const before = sends;
        await worker.deliverOne();
        let d = ok(await owner.call("GET", `${ctx.path}/doses/${ctx.dose.id}`));
        assert.equal(d.reminders[0].errorCode, "NOT_LINKED");
        assert.equal(sends, before);
        await disable(ctx);
        link = await db.update(
          "ChannelLink",
          { _id: link._id },
          { revokedAt: null },
        );
        const paused = await freshReminderPatient("C2 paused fixture");
        await worker.queueDue();
        ok(
          await owner.call(
            "POST",
            `${paused.path}/schedules/${paused.data.schedule.id}/pause`,
            { expectedRevision: paused.data.schedule.revision },
          ),
        );
        await worker.deliverOne();
        assert.equal(
          ok(await owner.call("GET", `${paused.path}/doses/${paused.dose.id}`))
            .reminders[0].errorCode,
          "RECORD_INACTIVE",
        );
        await disable(paused);
        const terminal = await freshReminderPatient("C2 terminal fixture");
        await worker.queueDue();
        ok(
          await action(
            owner,
            `${terminal.path}/doses/${terminal.dose.id}/actions`,
            { expectedRevision: 0, action: "taken" },
          ),
        );
        await worker.deliverOne();
        assert.equal(
          ok(
            await owner.call(
              "GET",
              `${terminal.path}/doses/${terminal.dose.id}`,
            ),
          ).reminders[0].status,
          "suppressed",
        );
        await disable(terminal);
        const expired = await freshReminderPatient("C2 expired fixture");
        clock = new Date(clock.getTime() + 61 * 60000);
        await worker.queueDue();
        d = ok(
          await owner.call("GET", `${expired.path}/doses/${expired.dose.id}`),
        );
        assert.equal(d.reminders[0].status, "expired");
        assert.equal(d.dose.state, "pending");
        await disable(expired);
      },
    );
    await t.test(
      "API restart retains action/history, reminder attempts and disabled/unknown distinctions",
      async () => {
        const before = ok(await owner.call("GET", route(first)));
        await new Promise((r) => server.close(r));
        await start();
        assert.deepEqual(ok(await owner.call("GET", route(first))), before);
        assert.equal(
          await mongoose.connection
            .collection("stockTransactions")
            .countDocuments(),
          0,
        );
        assert.equal(
          await mongoose.model("NotificationJob").countDocuments(),
          0,
        );
      },
    );
  },
);
