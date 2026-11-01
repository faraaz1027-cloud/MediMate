import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import express from "express";
import mongoose from "mongoose";
import { createV1 } from "../v1/app.js";
import { db } from "../v1/store.js";

// Uses a fresh database in the provided test replica set; never drops the supplied database.
const uri = process.env.MONGODB_TEST_URI;
test(
  "Step 17 database-connected API acceptance",
  { timeout: 90000 },
  async (t) => {
    assert.ok(
      uri,
      "Set MONGODB_TEST_URI to a local test replica set before running test:api.",
    );
    await mongoose.connect(uri, {
      dbName: "medimate_test_" + randomUUID().replaceAll("-", ""),
      serverSelectionTimeoutMS: 5000,
    });
    let server, base;
    async function start() {
      const app = express();
      app.use("/api/v1", createV1({ db }));
      server = app.listen(0, "127.0.0.1");
      await new Promise((r) => server.once("listening", r));
      base = `http://127.0.0.1:${server.address().port}/api/v1`;
    }
    await db.init();
    await start();
    t.after(async () => {
      await new Promise((r) => server.close(r));
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    });
    function client() {
      return {
        cookie: "",
        csrf: "",
        async call(method, path, body, opts = {}) {
          const headers = {
            "Content-Type": "application/json",
            Cookie: this.cookie,
            ...(method === "GET"
              ? {}
              : {
                  "X-CSRF-Token": this.csrf,
                  "Idempotency-Key": opts.key || randomUUID(),
                }),
            ...opts.headers,
          };
          const res = await fetch(base + path, {
            method,
            headers,
            ...(body === undefined
              ? {}
              : { body: opts.raw ? body : JSON.stringify(body) }),
          });
          if (res.headers.get("set-cookie"))
            this.cookie = res.headers.get("set-cookie").split(";")[0];
          const json = res.status === 204 ? null : await res.json();
          if (json?.data?.csrfToken) this.csrf = json.data.csrfToken;
          return { status: res.status, body: json };
        },
      };
    }
    const owner = client(),
      caregiver = client(),
      stranger = client();
    let patientId, ownerId, caregiverId;
    const route = (name) => `/patients/${patientId}/${name}`;
    async function register(c, name) {
      assert.equal((await c.call("GET", "/auth/csrf")).status, 200);
      const r = await c.call("POST", "/auth/register", {
        email: name + "@example.test",
        password: "Synthetic-pass-123!",
        displayName: name,
      });
      assert.equal(r.status, 201, JSON.stringify(r));
      return r.body.data;
    }
    await t.test(
      "registration, session rotation and private credential projection",
      async () => {
        const old = (await owner.call("GET", "/auth/csrf"), owner.cookie);
        const o = await register(owner, "Owner");
        patientId = o.patientId;
        ownerId = o.user.id;
        assert.notEqual(owner.cookie, old);
        caregiverId = (await register(caregiver, "Caregiver")).user.id;
        await register(stranger, "Stranger");
        const r = await owner.call("GET", "/auth/me");
        assert.equal(r.status, 200);
        assert.equal(r.body.data.id, ownerId);
        assert.ok(r.body.data.patients.some((p) => p.id === patientId));
        assert.equal(JSON.stringify(r).includes("passwordHash"), false);
      },
    );
    await t.test(
      "unauthenticated, cross-patient and CSRF/origin rejection",
      async () => {
        assert.equal((await client().call("GET", route("tasks"))).status, 401);
        assert.equal((await stranger.call("GET", route("tasks"))).status, 404);
        assert.equal(
          (
            await owner.call(
              "POST",
              route("tasks"),
              {},
              { headers: { "X-CSRF-Token": "wrong" } },
            )
          ).status,
          403,
        );
        assert.equal(
          (
            await owner.call(
              "POST",
              route("tasks"),
              {},
              { headers: { Origin: "https://untrusted.example" } },
            )
          ).status,
          403,
        );
        assert.equal(
          (await owner.call("GET", "/patients/invalid/tasks")).status,
          400,
        );
      },
    );
    const cases = [
      [
        "prescriptions",
        {
          title: "Synthetic prescription",
          instructions: [
            {
              lineNumber: 1,
              medicineText: "Demo A",
              instructionsText: "Synthetic example only",
              clarificationRequired: true,
              doseQuantity: "1.25",
              doseUnit: "tablet",
            },
          ],
        },
      ],
      [
        "cabinet-items",
        {
          displayName: "Demo A",
          entryType: "manual",
          strengthText: "synthetic",
        },
      ],
      [
        "tasks",
        {
          title: "Synthetic handover",
          assigneeUserId: ownerId,
          type: "general",
          handoverNote: "Example note",
        },
      ],
    ];
    for (const [name, body] of cases)
      await t.test(
        `POST/GET ${name}: persistence, replay and changed-payload conflict`,
        async () => {
          const key = randomUUID();
          const a = await owner.call("POST", route(name), body, { key });
          assert.equal(a.status, 201, JSON.stringify(a));
          const b = await owner.call("POST", route(name), body, { key });
          assert.equal(b.status, 200);
          assert.deepEqual(b.body.data, a.body.data);
          const conflict = await owner.call(
            "POST",
            route(name),
            {
              ...body,
              ...(name === "cabinet-items"
                ? { displayName: "changed" }
                : { title: "changed" }),
            },
            { key },
          );
          assert.equal(conflict.status, 409);
          const list = await owner.call("GET", route(name));
          assert.equal(list.status, 200);
          assert.equal(list.body.data.length, 1);
          assert.equal(list.body.meta.nextCursor, null);
          if (name === "prescriptions") {
            assert.equal(a.body.data.draftVersion.status, "draft");
            assert.equal(
              a.body.data.draftVersion.instructions[0].doseQuantity,
              "1.25",
            );
            assert.equal(
              await mongoose.model("PrescriptionVersion").countDocuments(),
              1,
            );
            assert.equal(
              await mongoose.model("PrescriptionInstruction").countDocuments(),
              1,
            );
          }
          if (name === "tasks")
            assert.equal(await mongoose.model("TaskEvent").countDocuments(), 1);
        },
      );
    await t.test(
      "concurrent duplicate creates commit one item and one audit",
      async () => {
        const key = randomUUID(),
          body = { displayName: "Concurrent demo", entryType: "manual" };
        const audits = await mongoose.model("AuditEvent").countDocuments();
        const results = await Promise.all([
          owner.call("POST", route("cabinet-items"), body, { key }),
          owner.call("POST", route("cabinet-items"), body, { key }),
        ]);
        assert.deepEqual(results.map((r) => r.status).sort(), [200, 201]);
        assert.equal(results[0].body.data.id, results[1].body.data.id);
        assert.equal(
          await mongoose.model("AuditEvent").countDocuments(),
          audits + 1,
        );
        assert.equal(
          await mongoose
            .model("CabinetItem")
            .countDocuments({ displayName: body.displayName }),
          1,
        );
      },
    );
    await t.test(
      "validation and mass assignment cannot write partial data",
      async () => {
        const count = await mongoose.model("Prescription").countDocuments();
        const body = {
          ...cases[0][1],
          instructions: [
            ...cases[0][1].instructions,
            { ...cases[0][1].instructions[0] },
          ],
        };
        assert.equal(
          (await owner.call("POST", route("prescriptions"), body)).status,
          422,
        );
        assert.equal(
          await mongoose.model("Prescription").countDocuments(),
          count,
        );
        assert.equal(
          (
            await owner.call("POST", route("cabinet-items"), {
              ...cases[1][1],
              patientId: "f".repeat(24),
            })
          ).status,
          422,
        );
        assert.equal(
          (
            await owner.call("POST", route("cabinet-items"), {
              displayName: "X",
              entryType: "external",
            })
          ).status,
          422,
        );
        assert.equal(
          (
            await owner.call("POST", route("tasks"), {
              ...cases[2][1],
              assigneeUserId: caregiverId,
            })
          ).status,
          422,
        );
        assert.equal(
          (
            await owner.call("POST", route("tasks"), cases[2][1], {
              headers: { "Idempotency-Key": "" },
            })
          ).status,
          400,
        );
        for (const dueAtUTC of [
          "2026-02-30T08:00:00Z",
          "2026-11-02T25:00:00Z",
          "2026-11-02T08:00:00+06:00",
        ]) {
          assert.equal(
            (
              await owner.call("POST", route("tasks"), {
                ...cases[2][1],
                dueAtUTC,
              })
            ).status,
            422,
          );
        }
        for (const query of [
          "?limit=0",
          "?status=invalid",
          "?cursor=bad",
          "?unknown=1",
          "?limit=1&limit=2",
        ])
          assert.equal(
            (await owner.call("GET", route("tasks") + query)).status,
            400,
          );
        assert.equal(
          (await owner.call("POST", route("tasks"), "{bad", { raw: true }))
            .status,
          400,
        );
        assert.equal(
          (
            await owner.call("POST", route("tasks"), {
              title: "x".repeat(70000),
            })
          ).status,
          413,
        );
      },
    );
    await t.test(
      "permission grants, assignment checks and revocation apply on next request",
      async () => {
        const grant = await owner.call("POST", route("access-grants"), {
          userId: caregiverId,
          permissions: ["task.read", "task.write"],
        });
        assert.equal(grant.status, 201);
        assert.ok(
          (await caregiver.call("GET", "/auth/me")).body.data.patients.some(
            (p) => p.id === patientId,
          ),
        );
        assert.equal((await caregiver.call("GET", route("tasks"))).status, 200);
        assert.equal(
          (await caregiver.call("GET", route("cabinet-items"))).status,
          403,
        );
        const key = randomUUID(),
          body = { ...cases[2][1], assigneeUserId: caregiverId };
        assert.equal(
          (await caregiver.call("POST", route("tasks"), body, { key })).status,
          201,
        );
        const revoke =
          route("access-grants") + "/" + grant.body.data.id + "/revoke";
        assert.equal(
          (await owner.call("POST", revoke, { expectedRevision: 1 })).status,
          409,
        );
        assert.equal(
          (await owner.call("POST", revoke, { expectedRevision: 0 })).status,
          200,
        );
        assert.equal((await caregiver.call("GET", route("tasks"))).status, 404);
        assert.equal(
          (await caregiver.call("GET", "/auth/me")).body.data.patients.some(
            (p) => p.id === patientId,
          ),
          false,
        );
        assert.equal(
          (await caregiver.call("POST", route("tasks"), body, { key })).status,
          404,
        );
        assert.equal(
          (await owner.call("POST", route("tasks"), body)).status,
          422,
        );
      },
    );
    await t.test("Step 19 account, patient and access administration", async () => {
      const me = (await owner.call("GET", "/auth/me")).body.data;
      assert.equal(me.patients.find((p) => p.id === patientId).role, "owner");
      assert.ok(me.permissionCatalog.includes("prescription.confirm"));
      const profileKey = randomUUID();
      const profile = { displayName: "Updated owner", expectedRevision: me.revision };
      assert.equal((await owner.call("PATCH", "/me", profile, { key: profileKey })).status, 200);
      assert.equal((await owner.call("PATCH", "/me", profile, { key: profileKey })).status, 200);
      assert.equal((await owner.call("PATCH", "/me", profile)).status, 409);
      const updated = (await owner.call("GET", "/auth/me")).body.data;
      assert.equal(updated.displayName, "Updated owner");
      assert.equal(updated.revision, me.revision + 1);
      assert.equal(JSON.stringify(updated).includes("passwordHash"), false);
      assert.equal((await owner.call("PATCH", "/me", { ...profile, role: "admin" })).status, 422);
      const key = randomUUID(), input = { displayName: "Second patient", timezone: "Asia/Dhaka" };
      const created = await owner.call("POST", "/patients", input, { key });
      assert.equal(created.status, 201);
      assert.equal((await owner.call("POST", "/patients", input, { key })).body.data.id, created.body.data.id);
      assert.equal((await stranger.call("GET", "/patients/" + created.body.data.id)).status, 404);
      assert.equal((await owner.call("POST", "/patients", { ...input, timezone: "Invalid/Zone" })).status, 422);
      const edit = { displayName: "Patient edited", timezone: "UTC", expectedRevision: 0 };
      assert.equal((await owner.call("PATCH", "/patients/" + created.body.data.id, edit)).status, 200);
      assert.equal((await owner.call("PATCH", "/patients/" + created.body.data.id, edit)).status, 409);
      const grants = await owner.call("GET", route("access-grants"));
      assert.equal(grants.status, 200);
      const grant = grants.body.data.find((g) => g.userId === caregiverId);
      const restore = { expectedRevision: grant.revision, permissions: ["task.read"] };
      assert.equal((await owner.call("PATCH", route("access-grants") + "/" + grant.id, restore)).status, 200);
      const discovery = (await caregiver.call("GET", "/auth/me")).body.data;
      const shared = discovery.patients.find((p) => p.id === patientId);
      assert.equal(shared.role, "caregiver");
      assert.deepEqual(shared.permissions, ["task.read"]);
      assert.equal((await caregiver.call("GET", route("tasks"))).status, 200);
      assert.equal((await caregiver.call("POST", route("tasks"), cases[2][1])).status, 403);
      assert.equal((await caregiver.call("GET", route("access-grants"))).status, 403);
      assert.equal((await caregiver.call("PATCH", "/patients/" + patientId, edit)).status, 403);
      assert.equal((await stranger.call("GET", route("access-grants"))).status, 404);
      const grantPath = route("access-grants") + "/" + grant.id;
      assert.equal((await owner.call("PATCH", "/patients/" + created.body.data.id + "/access-grants/" + grant.id, restore)).status, 404);
      assert.equal((await owner.call("PATCH", grantPath, restore)).status, 409);
      assert.equal((await owner.call("PATCH", grantPath, { expectedRevision: grant.revision + 1, permissions: ["access.manage"] })).status, 422);
      // Same active browser session loses read access on the very next request.
      assert.equal((await owner.call("POST", grantPath + "/revoke", { expectedRevision: grant.revision + 1 })).status, 200);
      assert.equal((await caregiver.call("GET", route("tasks"))).status, 404);
      assert.equal((await caregiver.call("GET", "/auth/me")).body.data.patients.some((p) => p.id === patientId), false);
      const badCsrf = { headers: { "X-CSRF-Token": "expired" } };
      assert.equal((await owner.call("PATCH", "/me", { displayName: "No change", expectedRevision: updated.revision }, badCsrf)).status, 403);
      assert.ok(await mongoose.model("AuditEvent").countDocuments({ actorUserId: ownerId, action: "PATCH/me" }));
      const strangerUserId = (await stranger.call("GET", "/auth/me")).body.data.id;
      await mongoose.model("Session").updateMany({ userId: strangerUserId }, { $set: { expiresAt: new Date(0) } });
      assert.equal((await stranger.call("GET", "/auth/me")).status, 401);
      assert.equal((await stranger.call("POST", "/patients", input)).status, 401);
    });
    await t.test(
      "cursor pagination stays stable across new inserts",
      async () => {
        const first = await owner.call(
          "GET",
          route("cabinet-items") + "?limit=1",
        );
        assert.ok(first.body.meta.nextCursor);
        await owner.call("POST", route("cabinet-items"), {
          displayName: "Newer",
          entryType: "manual",
        });
        const second = await owner.call(
          "GET",
          route("cabinet-items") +
            "?limit=1&cursor=" +
            encodeURIComponent(first.body.meta.nextCursor),
        );
        assert.equal(second.status, 200);
        assert.notEqual(first.body.data[0].id, second.body.data[0].id);
        assert.equal(second.body.meta.nextCursor, null);
      },
    );
    await t.test(
      "API restart preserves database records and sessions; logout revokes session",
      async () => {
        await new Promise((r) => server.close(r));
        await start();
        assert.equal(
          (await owner.call("GET", route("prescriptions"))).body.data.length,
          1,
        );
        assert.equal((await owner.call("GET", "/auth/me")).status, 200);
        const validCookie = owner.cookie;
        assert.equal((await owner.call("POST", "/auth/logout")).status, 204);
        owner.cookie = validCookie;
        assert.equal((await owner.call("GET", "/auth/me")).status, 401);
        await owner.call("GET", "/auth/csrf");
        assert.equal(
          (
            await owner.call("POST", "/auth/login", {
              email: "owner@example.test",
              password: "Synthetic-pass-123!",
            })
          ).status,
          200,
        );
        assert.equal((await owner.call("GET", route("tasks"))).status, 200);
      },
    );
    await t.test(
      "transaction rolls back all writes on a dependency failure",
      async () => {
        const count = await mongoose.model("CabinetItem").countDocuments();
        const original = db.insert;
        try {
          db.insert = async (name, ...args) => {
            if (name === "AuditEvent")
              throw new Error("injected write failure");
            return original(name, ...args);
          };
          assert.equal(
            (
              await owner.call("POST", route("cabinet-items"), {
                displayName: "Rollback",
                entryType: "manual",
              })
            ).status,
            503,
          );
        } finally {
          db.insert = original;
        }
        assert.equal(
          await mongoose.model("CabinetItem").countDocuments(),
          count,
        );
      },
    );
  },
);
