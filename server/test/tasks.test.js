import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import express from "express";
import mongoose from "mongoose";
import { createV1 } from "../v1/app.js";
import { db } from "../v1/store.js";
import { createTaskWorker } from "../v1/taskNotifications.js";
import { handleTelegramUpdate } from "../v1/channels.js";
import { TelegramError } from "../v1/telegram.js";

test(
  "Step 23 C1 task lifecycle, channel consent and persisted notification worker (controlled Telegram)",
  { timeout: 90000 },
  async (t) => {
    assert.ok(process.env.MONGODB_TEST_URI);
    await mongoose.connect(process.env.MONGODB_TEST_URI, {
      dbName: "c1_" + randomUUID().replaceAll("-", ""),
      serverSelectionTimeoutMS: 5000,
    });
    await db.init();
    let server,
      base,
      clock = Date.now(),
      failEvent = false,
      outcome = "sent",
      sends = 0,
      updates = [];
    const now = () => new Date(clock),
      telegram = {
        enabled: true,
        username: "MediMateTestBot",
        async updates(offset) {
          return updates.filter((u) => u.update_id >= offset);
        },
        async sendTaskNotice() {
          sends++;
          if (outcome === "failed")
            throw new TelegramError("RECIPIENT_BLOCKED");
          if (outcome === "unknown")
            throw new TelegramError("OUTCOME_UNKNOWN", true);
          return { messageId: String(sends) };
        },
      };
    const wrapped = {
      ...db,
      async insert(name, ...args) {
        if (failEvent && name === "TaskEvent")
          throw Error("test event failure");
        return db.insert(name, ...args);
      },
    };
    async function start() {
      const app = express();
      app.use("/api/v1", createV1({ db: wrapped, telegram, now }));
      server = app.listen(0, "127.0.0.1");
      await new Promise((r) => server.once("listening", r));
      base = `http://127.0.0.1:${server.address().port}/api/v1`;
    }
    await start();
    let worker = createTaskWorker({ db, telegram, now });
    t.after(async () => {
      await new Promise((r) => server.close(r));
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    });
    function client() {
      return {
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
          if (b?.data?.csrfToken) this.csrf = b.data.csrfToken;
          return { status: r.status, body: b };
        },
      };
    }
    async function register(c, name) {
      await c.call("GET", "/auth/csrf");
      const r = await c.call("POST", "/auth/register", {
        email: name + "@example.test",
        password: "Synthetic-pass-123!",
        displayName: name,
      });
      assert.equal(r.status, 201);
      return r.body.data;
    }
    const owner = client(),
      caregiver = client(),
      other = client(),
      stranger = client(),
      a = await register(owner, "C1Owner"),
      c = await register(caregiver, "C1Carer"),
      o = await register(other, "C1Other");
    await register(stranger, "C1Stranger");
    const patient = `/patients/${a.patientId}`,
      route = patient + "/tasks",
      grants = patient + "/access-grants",
      body = {
        title: "Synthetic caregiver task",
        type: "general",
        assigneeUserId: c.user.id,
        handoverNote: "Synthetic initial handover",
      };
    let grant = (
      await owner.call("POST", grants, {
        userId: c.user.id,
        permissions: ["task.read", "task.write"],
      })
    ).body.data;
    await owner.call("POST", grants, {
      userId: o.user.id,
      permissions: ["task.read", "task.write"],
    });
    async function revoke() {
      const r = await owner.call("POST", grants + `/${grant.id}/revoke`, {
        expectedRevision: grant.revision,
      });
      assert.equal(r.status, 200);
      grant = r.body.data;
    }
    async function restore() {
      const r = await owner.call("PATCH", grants + `/${grant.id}`, {
        expectedRevision: grant.revision,
        permissions: ["task.read", "task.write"],
      });
      assert.equal(r.status, 200);
      grant = r.body.data;
    }
    async function create(extra = {}) {
      const r = await owner.call("POST", route, { ...body, ...extra });
      assert.equal(r.status, 201);
      return r.body.data;
    }
    async function drain() {
      for (let i = 0; i < 20; i++) if (!(await worker.deliverOne())) break;
    }
    let task, link, challenge;
    await t.test(
      "create/assignment is atomic and replay/concurrency create one event and job",
      async () => {
        const key = randomUUID(),
          r = await Promise.all([
            owner.call("POST", route, body, key),
            owner.call("POST", route, body, key),
          ]);
        assert.ok(r.every((x) => [200, 201].includes(x.status)));
        assert.equal(r[0].body.data.id, r[1].body.data.id);
        task = r[0].body.data;
        assert.equal(await mongoose.model("TaskEvent").countDocuments(), 1);
        assert.equal(
          await mongoose.model("NotificationJob").countDocuments(),
          1,
        );
        assert.equal(
          await mongoose.model("NotificationAttempt").countDocuments(),
          0,
        );
        assert.equal(task.acknowledgedAt, undefined);
        const members = (await owner.call("GET", patient + "/task-assignees"))
          .body.data;
        assert.ok(members.some((m) => m.id === c.user.id));
        assert.equal(
          (
            await owner.call("POST", route, {
              ...body,
              assigneeUserId: "f".repeat(24),
            })
          ).status,
          422,
        );
      },
    );
    await t.test(
      "state machine, participants and revision conflicts are enforced",
      async () => {
        assert.equal(
          (
            await owner.call("POST", route + `/${task.id}/transitions`, {
              expectedRevision: 0,
              action: "complete",
            })
          ).status,
          409,
        );
        assert.equal(
          (
            await other.call("POST", route + `/${task.id}/transitions`, {
              expectedRevision: 0,
              action: "accept",
            })
          ).status,
          403,
        );
        const r = await caregiver.call(
          "POST",
          route + `/${task.id}/transitions`,
          { expectedRevision: 0, action: "accept" },
        );
        assert.equal(r.status, 200);
        task = r.body.data;
        assert.equal(task.status, "accepted");
        assert.equal(task.acknowledgedAt, undefined);
        assert.equal(
          (
            await owner.call("PATCH", route + "/" + task.id, {
              expectedRevision: 0,
              title: "stale",
            })
          ).status,
          409,
        );
        await revoke();
        assert.equal(
          (
            await caregiver.call("POST", route + `/${task.id}/transitions`, {
              expectedRevision: 1,
              action: "complete",
            })
          ).status,
          404,
        );
        await restore();
        task = (
          await caregiver.call("POST", route + `/${task.id}/transitions`, {
            expectedRevision: 1,
            action: "complete",
          })
        ).body.data;
        assert.equal(task.status, "completed");
        assert.equal(
          (
            await caregiver.call("POST", route + `/${task.id}/transitions`, {
              expectedRevision: 2,
              action: "reopen",
            })
          ).status,
          403,
        );
        task = (
          await owner.call("POST", route + `/${task.id}/transitions`, {
            expectedRevision: 2,
            action: "reopen",
          })
        ).body.data;
        assert.equal(task.assignmentGeneration, 1);
        assert.equal(task.status, "open");
      },
    );
    await t.test(
      "handover is append-only, scoped, replay-safe and paginated",
      async () => {
        const key = randomUUID(),
          p = route + `/${task.id}/notes`,
          b = { text: "Synthetic additional handover" };
        assert.equal((await caregiver.call("POST", p, b, key)).status, 201);
        assert.equal((await caregiver.call("POST", p, b, key)).status, 200);
        assert.equal((await other.call("POST", p, b)).status, 403);
        for (const suffix of ["", "/history", "/notifications"])
          assert.equal(
            (await stranger.call("GET", route + "/" + task.id + suffix)).status,
            404,
          );
        const h = (
          await owner.call("GET", route + `/${task.id}/history?limit=1`)
        ).body;
        assert.equal(h.data.length, 1);
        assert.ok(h.meta.nextCursor);
        assert.equal(h.data[0].text, b.text);
        assert.equal(
          (
            await owner.call(
              "GET",
              route +
                `/${task.id}/history?limit=1&cursor=` +
                encodeURIComponent(h.meta.nextCursor),
            )
          ).body.data.length,
          1,
        );
      },
    );
    await t.test(
      "Telegram linking needs private /start proof AND app consent; codes are hashed and shown once",
      async () => {
        const key = randomUUID(),
          r = await caregiver.call(
            "POST",
            "/me/channel-link-challenges",
            { provider: "telegram" },
            key,
          );
        assert.equal(r.status, 201);
        challenge = r.body.data;
        const token = new URL(challenge.challengeUrl).searchParams.get("start");
        assert.equal(token.length, 64);
        assert.equal(
          (
            await caregiver.call(
              "POST",
              "/me/channel-link-challenges",
              { provider: "telegram" },
              key,
            )
          ).body.data.challengeUrl,
          null,
        );
        const stored = await db.one("ChannelChallenge", { _id: challenge.id });
        assert.equal(stored.tokenHash.length, 64);
        assert.ok(
          !JSON.stringify(
            await mongoose.model("Operation").find().lean(),
          ).includes(token),
        );
        await handleTelegramUpdate(
          db,
          {
            update_id: 1,
            message: {
              chat: { type: "group", id: 1001 },
              from: { id: 1001, is_bot: false },
              text: "/start " + token,
            },
          },
          now,
        );
        assert.equal(
          (await db.one("ChannelChallenge", { _id: challenge.id })).status,
          "pending",
        );
        updates = [
          {
            update_id: 2,
            message: {
              chat: { type: "private", id: 1001 },
              from: { id: 1001, is_bot: false },
              text: "/start " + token,
            },
          },
        ];
        await worker.pollOnce();
        await worker.pollOnce();
        assert.equal(
          await mongoose.model("TelegramReceipt").countDocuments(),
          2,
        );
        assert.equal(await mongoose.model("ChannelLink").countDocuments(), 0);
        const proposed = (
          await caregiver.call("GET", "/me/channel-links")
        ).body.data.challenges.find((x) => x.id === challenge.id);
        assert.equal(proposed.status, "proposed");
        assert.equal(proposed.accountHint, "…1001");
        assert.equal(
          (
            await stranger.call(
              "POST",
              `/me/channel-link-challenges/${challenge.id}/confirm`,
              { expectedRevision: 1, consent: true },
            )
          ).status,
          409,
        );
        assert.equal(
          (
            await caregiver.call(
              "POST",
              `/me/channel-link-challenges/${challenge.id}/confirm`,
              { expectedRevision: 1, consent: false },
            )
          ).status,
          422,
        );
        const confirmed = await caregiver.call(
          "POST",
          `/me/channel-link-challenges/${challenge.id}/confirm`,
          { expectedRevision: 1, consent: true },
        );
        assert.equal(confirmed.status, 200);
        link = confirmed.body.data;
        assert.equal(link.provider, "telegram");
        assert.equal(link.chatId, undefined);
      },
    );
    await t.test(
      "unlinked/stale notices suppress; explicit failure retry retains attempts and does not acknowledge",
      async () => {
        await drain();
        let jobs = await db.list("NotificationJob", { taskId: task.id }, 5);
        assert.ok(jobs.every((j) => j.status === "suppressed"));
        let job = jobs.find((j) => j.generation === 1);
        outcome = "failed";
        assert.equal(
          (
            await owner.call(
              "POST",
              route + `/${task.id}/notifications/${job._id}/retry`,
              {},
            )
          ).status,
          200,
        );
        await drain();
        job = await db.one("NotificationJob", { _id: job._id });
        assert.equal(job.status, "failed");
        outcome = "sent";
        const retryPath = route + `/${task.id}/notifications/${job._id}/retry`,
          key = randomUUID();
        assert.equal(
          (await owner.call("POST", retryPath, {}, key)).status,
          200,
        );
        assert.equal(
          (await owner.call("POST", retryPath, {}, key)).status,
          200,
        );
        await Promise.all([worker.deliverOne(), worker.deliverOne()]);
        job = await db.one("NotificationJob", { _id: job._id });
        assert.equal(job.status, "sent");
        assert.equal(job.attemptCount, 3);
        assert.equal(sends, 2);
        assert.equal(
          (await db.one("Task", { _id: task.id })).acknowledgedAt,
          null,
        );
        assert.equal((await owner.call("POST", retryPath, {})).status, 409);
        const view = (
          await owner.call("GET", route + `/${task.id}/notifications`)
        ).body.data.find((j) => j.id === String(job._id));
        assert.equal(view.attempts.length, 3);
        assert.ok(!JSON.stringify(view).includes("chatId"));
      },
    );
    await t.test(
      "authenticated acknowledgement is separate from sent and resets on reassignment",
      async () => {
        assert.equal(
          (
            await owner.call("POST", route + `/${task.id}/acknowledgements`, {
              expectedRevision: task.revision,
            })
          ).status,
          403,
        );
        task = (
          await caregiver.call("POST", route + `/${task.id}/acknowledgements`, {
            expectedRevision: task.revision,
          })
        ).body.data;
        assert.ok(task.acknowledgedAt);
        assert.equal(task.status, "open");
        assert.equal(
          await mongoose.model("Acknowledgement").countDocuments(),
          1,
        );
        task = (
          await owner.call("PATCH", route + "/" + task.id, {
            expectedRevision: task.revision,
            assigneeUserId: o.user.id,
            title: "Reassigned synthetic task",
            dueAtUTC: null,
          })
        ).body.data;
        assert.equal(task.acknowledgedAt, null);
        assert.equal(task.assignmentGeneration, 2);
        assert.equal(task.assigneeUserId, o.user.id);
        assert.equal(
          (
            await caregiver.call("POST", route + `/${task.id}/transitions`, {
              expectedRevision: task.revision,
              action: "accept",
            })
          ).status,
          403,
        );
        await drain();
      },
    );
    await t.test(
      "unknown provider outcome and interrupted lease never cause blind resend",
      async () => {
        const u = await create({ title: "Unknown-outcome synthetic task" });
        outcome = "unknown";
        await drain();
        let job = await db.one("NotificationJob", { taskId: u.id });
        assert.equal(job.status, "unknown");
        assert.equal(
          (
            await owner.call(
              "POST",
              route + `/${u.id}/notifications/${job._id}/retry`,
              {},
            )
          ).status,
          409,
        );
        const before = sends;
        await drain();
        assert.equal(sends, before);
        outcome = "sent";
        const crash = await create({ title: "Interrupted synthetic task" });
        job = await db.one("NotificationJob", { taskId: crash.id });
        await db.update(
          "NotificationJob",
          { _id: job._id },
          {
            status: "processing",
            attemptCount: 1,
            leaseUntil: new Date(clock - 1),
          },
        );
        await db.insert("NotificationAttempt", {
          patientId: a.patientId,
          jobId: job._id,
          attemptNumber: 1,
          status: "attempted",
          attemptedAt: now(),
        });
        await worker.deliverOne();
        assert.equal(
          (await db.one("NotificationJob", { _id: job._id })).status,
          "unknown",
        );
        assert.equal(sends, before);
      },
    );
    await t.test(
      "revocation and unlink are checked immediately before send",
      async () => {
        const r = await create({ title: "Revocation synthetic task" });
        await revoke();
        const before = sends;
        await drain();
        assert.equal(
          (await db.one("NotificationJob", { taskId: r.id })).errorCode,
          "ACCESS_REVOKED",
        );
        assert.equal(sends, before);
        await restore();
        const u = await create({ title: "Unlinked synthetic task" });
        assert.equal(
          (await caregiver.call("DELETE", "/me/channel-links/" + link.id, {}))
            .status,
          200,
        );
        await drain();
        assert.equal(
          (await db.one("NotificationJob", { taskId: u.id })).errorCode,
          "NOT_LINKED",
        );
        assert.equal(sends, before);
      },
    );
    await t.test(
      "expired/link replay cannot activate; transaction failure rolls back all task work",
      async () => {
        const ch = (
            await other.call("POST", "/me/channel-link-challenges", {
              provider: "telegram",
            })
          ).body.data,
          token = new URL(ch.challengeUrl).searchParams.get("start");
        clock += 600001;
        await handleTelegramUpdate(
          db,
          {
            update_id: 3,
            message: {
              chat: { type: "private", id: 2002 },
              from: { id: 2002, is_bot: false },
              text: "/start " + token,
            },
          },
          now,
        );
        assert.equal(
          (await db.one("ChannelChallenge", { _id: ch.id })).status,
          "pending",
        );
        const count = await mongoose.model("Task").countDocuments(),
          jobs = await mongoose.model("NotificationJob").countDocuments();
        failEvent = true;
        assert.equal((await owner.call("POST", route, body)).status, 503);
        failEvent = false;
        assert.equal(await mongoose.model("Task").countDocuments(), count);
        assert.equal(
          await mongoose.model("NotificationJob").countDocuments(),
          jobs,
        );
      },
    );
    await t.test(
      "API/worker restart retains history, receipt offset and delivery/ack distinctions",
      async () => {
        await new Promise((r) => server.close(r));
        await start();
        worker = createTaskWorker({ db, telegram, now });
        await worker.pollOnce();
        assert.ok(
          (await db.one("WorkerState", { name: "telegram" })).offset >= 3,
        );
        assert.ok(
          (
            await owner.call("GET", route + `/${task.id}/history`)
          ).body.data.some((e) => e.eventType === "acknowledged"),
        );
        assert.equal(
          (await owner.call("GET", route + "/" + task.id)).body.data
            .assignmentGeneration,
          2,
        );
      },
    );
  },
);
