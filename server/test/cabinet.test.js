import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import express from "express";
import mongoose from "mongoose";
import { createV1 } from "../v1/app.js";
import { db } from "../v1/store.js";
import { createRxNorm } from "../v1/rxnorm.js";

test(
  "Step 22 B1 cabinet lifecycle and scoped external integration",
  { timeout: 90000 },
  async (t) => {
    assert.ok(process.env.MONGODB_TEST_URI);
    await mongoose.connect(process.env.MONGODB_TEST_URI, {
      dbName: "b1_" + randomUUID().replaceAll("-", ""),
      serverSelectionTimeoutMS: 5000,
    });
    await db.init();
    let server,
      base,
      outage = false,
      lookups = 0,
      failHistory = false;
    const props = {
      rxcui: "198440",
      name: "acetaminophen 500 MG Oral Tablet",
      tty: "SCD",
      suppress: "N",
    };
    function provider() {
      return createRxNorm({
        spacingMs: 0,
        fetchImpl: async (url) => {
          lookups++;
          if (outage) throw Error("injected outage");
          if (url.includes("drugs.json"))
            return Response.json({
              drugGroup: {
                conceptGroup: [
                  {
                    conceptProperties: url.includes("no-match")
                      ? []
                      : [
                          props,
                          {
                            ...props,
                            rxcui: "100000",
                            name: "Synthetic second candidate",
                          },
                        ],
                  },
                ],
              },
            });
          return Response.json({
            properties: url.includes("198440") ? props : null,
          });
        },
      });
    }
    async function start() {
      const app = express();
      app.use(
        "/api/v1",
        createV1({
          db: {
            ...db,
            async insert(name, ...args) {
              if (failHistory && name === "CabinetRevision")
                throw Error("injected history failure");
              return db.insert(name, ...args);
            },
          },
          rxnorm: provider(),
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
          const b = r.status === 204 ? null : await r.json();
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
      stranger = client();
    const a = await register(owner, "B1Owner"),
      carer = await register(caregiver, "B1Carer");
    await register(stranger, "B1Stranger");
    const patient = `/patients/${a.patientId}`,
      route = patient + "/cabinet-items",
      search = patient + "/medicine-search";
    const external = {
        entryType: "external",
        externalId: "198440",
        reviewed: true,
        strengthText: "500 MG",
        form: "Oral Tablet",
      },
      key = randomUUID();
    let saved, manual, grant;
    await t.test(
      "ambiguous search is paginated without auto-selection; no match remains empty",
      async () => {
        const r = await owner.call("GET", search + "?q=acetaminophen&limit=1");
        assert.equal(r.status, 200);
        assert.equal(r.body.data.candidates.length, 1);
        assert.equal(r.body.meta.total, 2);
        assert.ok(r.body.meta.nextCursor);
        const page = await owner.call(
          "GET",
          search +
            "?q=acetaminophen&limit=1&cursor=" +
            encodeURIComponent(r.body.meta.nextCursor),
        );
        assert.notEqual(
          page.body.data.candidates[0].externalId,
          r.body.data.candidates[0].externalId,
        );
        assert.equal(
          (
            await owner.call(
              "GET",
              search +
                "?q=wrong&cursor=" +
                encodeURIComponent(r.body.meta.nextCursor),
            )
          ).status,
          400,
        );
        assert.deepEqual(
          (await owner.call("GET", search + "?q=no-match")).body.data
            .candidates,
          [],
        );
        assert.equal(await mongoose.model("CabinetItem").countDocuments(), 0);
      },
    );
    await t.test(
      "server validates selected ID/review, rejects forged provenance and retains source snapshots",
      async () => {
        for (const b of [
          { ...external, reviewed: false },
          { ...external, externalId: "https://evil.test" },
          { ...external, sourceRecordId: "a".repeat(24) },
          { ...external, displayName: "Forged" },
          { ...external, externalId: "999" },
        ])
          assert.equal((await owner.call("POST", route, b)).status, 422);
        const r = await owner.call("POST", route, external, key);
        assert.equal(r.status, 201);
        saved = r.body.data;
        const d = (await owner.call("GET", route + "/" + saved.id)).body.data;
        assert.equal(d.displayName, props.name);
        assert.equal(d.source.externalId, "198440");
        assert.equal(d.source.snapshot.displayName, props.name);
        assert.equal(d.source.contentHash.length, 64);
        assert.ok(d.source.retrievedAt);
        assert.equal(
          (await owner.call("GET", route + "/" + saved.id + "/revisions")).body
            .data.length,
          1,
        );
      },
    );
    await t.test(
      "replay and concurrency do not duplicate item/source/history, even during provider outage",
      async () => {
        outage = true;
        const before = lookups;
        const r = await owner.call("POST", route, external, key);
        assert.equal(r.status, 200);
        assert.equal(r.body.data.id, saved.id);
        assert.equal(lookups, before);
        assert.equal(
          (
            await owner.call(
              "POST",
              route,
              { ...external, form: "different" },
              key,
            )
          ).status,
          409,
        );
        outage = false;
        const concurrentKey = randomUUID();
        const all = await Promise.all([
          owner.call("POST", route, external, concurrentKey),
          owner.call("POST", route, external, concurrentKey),
        ]);
        assert.equal(all[0].body.data.id, all[1].body.data.id);
        assert.ok(all.every((x) => [200, 201].includes(x.status)));
        assert.equal(await mongoose.model("SourceRecord").countDocuments(), 2);
        assert.equal(
          await mongoose.model("CabinetRevision").countDocuments(),
          2,
        );
      },
    );
    await t.test(
      "outage is explicit; manual create survives it and filters treat metacharacters literally",
      async () => {
        outage = true;
        const r = await owner.call("GET", search + "?q=outage");
        assert.equal(r.status, 503);
        assert.equal(r.body.error.code, "RXNORM_UNAVAILABLE");
        const m = await owner.call("POST", route, {
          entryType: "manual",
          displayName: "Synthetic [tablet]",
          strengthText: "demo strength",
          form: "demo form",
        });
        assert.equal(m.status, 201);
        manual = m.body.data;
        assert.equal(
          (
            await owner.call(
              "GET",
              route +
                "?q=" +
                encodeURIComponent("[tablet]") +
                "&entryType=manual",
            )
          ).body.data.length,
          1,
        );
        assert.equal(
          (await owner.call("GET", route + "/" + manual.id)).body.data.source,
          null,
        );
        outage = false;
      },
    );
    await t.test(
      "edits use revisions, preserve prior values/source and cannot relabel external identity",
      async () => {
        assert.equal(
          (
            await owner.call("PATCH", route + "/" + saved.id, {
              expectedRevision: 0,
              displayName: "Wrong identity",
              reason: "test",
            })
          ).status,
          422,
        );
        const r = await owner.call("PATCH", route + "/" + saved.id, {
          expectedRevision: 0,
          strengthText: "Reviewed transcription",
          reason: "Synthetic correction",
        });
        assert.equal(r.status, 200);
        saved = r.body.data;
        assert.equal(
          (
            await owner.call("PATCH", route + "/" + saved.id, {
              expectedRevision: 0,
              form: "stale",
              reason: "stale",
            })
          ).status,
          409,
        );
        const h = (
          await owner.call("GET", route + "/" + saved.id + "/revisions?limit=1")
        ).body;
        assert.equal(h.data[0].snapshot.strengthText, "Reviewed transcription");
        assert.ok(h.meta.nextCursor);
        const previous = (
          await owner.call(
            "GET",
            route +
              "/" +
              saved.id +
              "/revisions?limit=1&cursor=" +
              encodeURIComponent(h.meta.nextCursor),
          )
        ).body.data[0];
        assert.equal(previous.snapshot.strengthText, "500 MG");
        assert.equal(previous.snapshot.sourceRecordId, saved.sourceRecordId);
      },
    );
    await t.test(
      "patient scope, read-only access and revocation cover search/item/history and replay",
      async () => {
        for (const path of [
          search + "?q=test",
          search + "/198440",
          route,
          route + "/" + saved.id,
          route + "/" + saved.id + "/revisions",
        ])
          assert.equal((await stranger.call("GET", path)).status, 404);
        grant = (
          await owner.call("POST", patient + "/access-grants", {
            userId: carer.user.id,
            permissions: ["cabinet.read"],
          })
        ).body.data;
        assert.equal(
          (await caregiver.call("GET", search + "?q=acetaminophen")).status,
          200,
        );
        assert.equal(
          (
            await caregiver.call("POST", route, {
              entryType: "manual",
              displayName: "Denied",
            })
          ).status,
          403,
        );
        assert.equal(
          (
            await caregiver.call("POST", route + "/" + manual.id + "/archive", {
              expectedRevision: 0,
            })
          ).status,
          403,
        );
        await owner.call(
          "POST",
          patient + `/access-grants/${grant.id}/revoke`,
          { expectedRevision: grant.revision },
        );
        assert.equal(
          (await caregiver.call("GET", route + "/" + saved.id + "/revisions"))
            .status,
          404,
        );
      },
    );
    await t.test(
      "failed history write rolls back the item; legacy item gains honest baseline",
      async () => {
        failHistory = true;
        assert.equal(
          (
            await owner.call("PATCH", route + "/" + manual.id, {
              expectedRevision: 0,
              displayName: "Must rollback",
              reason: "test",
            })
          ).status,
          503,
        );
        failHistory = false;
        assert.equal(
          (await owner.call("GET", route + "/" + manual.id)).body.data
            .displayName,
          "Synthetic [tablet]",
        );
        const old = await db.insert("CabinetItem", {
          patientId: a.patientId,
          displayName: "Legacy item",
          entryType: "manual",
          status: "active",
        });
        assert.equal(
          (
            await owner.call("PATCH", route + "/" + old._id, {
              expectedRevision: 0,
              displayName: "Edited legacy",
              reason: "First reviewed change",
            })
          ).status,
          200,
        );
        const h = (
          await owner.call("GET", route + "/" + old._id + "/revisions")
        ).body.data;
        assert.equal(h.length, 2);
        assert.equal(h[1].legacyBaseline, true);
        assert.equal(h[1].actorUserId, null);
        assert.equal(h[1].snapshot.displayName, "Legacy item");
      },
    );
    await t.test(
      "archive preserves the ID and all history, excludes active list and blocks editing",
      async () => {
        const k = randomUUID(),
          path = route + "/" + saved.id + "/archive",
          b = { expectedRevision: saved.revision };
        const r = await owner.call("POST", path, b, k);
        assert.equal(r.status, 200);
        assert.equal(r.body.data.status, "archived");
        assert.equal((await owner.call("POST", path, b, k)).status, 200);
        assert.equal(
          (
            await owner.call("PATCH", route + "/" + saved.id, {
              expectedRevision: r.body.data.revision,
              form: "test",
              reason: "test",
            })
          ).status,
          409,
        );
        assert.ok(
          !(await owner.call("GET", route)).body.data.some(
            (x) => x.id === saved.id,
          ),
        );
        assert.ok(
          (await owner.call("GET", route + "?status=archived")).body.data.some(
            (x) => x.id === saved.id,
          ),
        );
        assert.equal(
          (await owner.call("GET", route + "/" + saved.id + "/revisions")).body
            .data.length,
          3,
        );
      },
    );
    await t.test(
      "API restart retains source, archived detail and immutable revisions",
      async () => {
        await new Promise((r) => server.close(r));
        await start();
        const d = (await owner.call("GET", route + "/" + saved.id)).body.data;
        assert.equal(d.status, "archived");
        assert.equal(d.source.snapshot.displayName, props.name);
        assert.equal(
          (await owner.call("GET", route + "/" + saved.id + "/revisions")).body
            .data.length,
          3,
        );
      },
    );
  },
);
