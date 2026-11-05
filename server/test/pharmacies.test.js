import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import express from "express";
import mongoose from "mongoose";
import { createV1 } from "../v1/app.js";
import { createOverpass, overpassUrl } from "../v1/overpass.js";
import { db } from "../v1/store.js";
import {
  expectStatus as ok,
  syntheticPassword,
} from "../../verification/step27/fixture.mjs";

const coords = "?latitude=23.74655&longitude=90.37604&radiusMeters=1000";
const mapped = {
  type: "node",
  id: 91,
  lat: 23.747,
  lon: 90.376,
  tags: {
    amenity: "pharmacy",
    name: "Synthetic pharmacy",
    phone: "Synthetic contact",
    opening_hours: "Mo-Fr 09:00-17:00",
  },
};
const mappedResponse = (elements = [mapped]) =>
  Response.json({
    osm3s: { timestamp_osm_base: "2026-11-05T10:00:00Z" },
    elements,
  });

test("Overpass bounds requests, projects node and way data, deduplicates, caches and distinguishes empty from partial data", async () => {
  let clock = Date.now(),
    calls = 0;
  let mode = "results";
  const adapter = createOverpass({
    clock: () => clock,
    spacingMs: 0,
    fetchImpl: async (url, options) => {
      calls++;
      assert.ok(url.startsWith(overpassUrl));
      const query =
        options.body?.get("data") ?? new URL(url).searchParams.get("data");
      assert.match(query, /around:1000,23\.7466,90\.3760/);
      assert.doesNotMatch(query, /patient|medicine|cookie/i);
      assert.equal(options.redirect, "error");
      if (mode === "empty") return mappedResponse([]);
      if (mode === "partial")
        return Response.json({ elements: [], remark: "runtime error" });
      return mappedResponse([
        mapped,
        mapped,
        {
          type: "way",
          id: 92,
          center: { lat: 23.75, lon: 90.376 },
          tags: { amenity: "pharmacy" },
        },
        { ...mapped, id: 93, lat: 20 },
        { ...mapped, id: 94, tags: { amenity: "hospital" } },
      ]);
    },
  });
  const lookup = () => adapter.search(23.74656, 90.37604, 1000);
  const [a, b] = await Promise.all([lookup(), lookup()]);
  assert.deepEqual(a, b);
  assert.equal(calls, 1);
  assert.deepEqual(
    a.listings.map((r) => r.externalPlaceKey),
    ["node/91", "way/92"],
  );
  assert.equal(a.listings[1].name, "Unnamed pharmacy listing");
  assert.equal(
    a.listings[0].listingUrl,
    "https://www.openstreetmap.org/node/91",
  );
  assert.equal(a.dataTimestamp, "2026-11-05T10:00:00.000Z");
  assert.deepEqual(await lookup(), a);
  assert.equal(calls, 1);
  await assert.rejects(adapter.search(91, 90, 1000));
  clock += 300001;
  mode = "partial";
  await assert.rejects(lookup());
  mode = "empty";
  assert.deepEqual((await lookup()).listings, []);
});

test("Overpass timeout aborts and rate rejection applies a cooldown", async () => {
  const timed = createOverpass({
    timeoutMs: 20,
    fetchImpl: (_, { signal }) =>
      new Promise((_, reject) => {
        const keepAlive = setTimeout(
          () => reject(Error("Timeout was not enforced")),
          1000,
        );
        signal.addEventListener(
          "abort",
          () => {
            clearTimeout(keepAlive);
            reject(signal.reason);
          },
          { once: true },
        );
      }),
  });
  await assert.rejects(timed.search(23, 90, 1000), { name: "TimeoutError" });
  let calls = 0;
  const limited = createOverpass({
    fetchImpl: async () => {
      calls++;
      return new Response("", { status: 429 });
    },
  });
  await assert.rejects(limited.search(23, 90, 1000));
  await assert.rejects(limited.search(24, 90, 1000));
  assert.equal(calls, 1);
});

test(
  "Step 31 preference and refill collection on real Express and MongoDB",
  { timeout: 90000 },
  async (t) => {
    await mongoose.connect(process.env.MONGODB_TEST_URI, {
      dbName: "a4_" + randomUUID().replaceAll("-", ""),
    });
    await db.init();
    let clock = new Date("2026-11-06T03:00:00Z"),
      unavailable = false,
      empty = false,
      calls = 0;
    const overpass = createOverpass({
      clock: () => clock.getTime(),
      spacingMs: 0,
      fetchImpl: async () => {
        calls++;
        if (unavailable)
          throw new DOMException("Synthetic timeout", "TimeoutError");
        return mappedResponse(empty ? [] : [mapped]);
      },
    });
    const app = express();
    app.use(
      "/api/v1",
      createV1({
        db,
        overpass,
        now: () => new Date(clock),
        telegram: { enabled: false },
      }),
    );
    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    t.after(async () => {
      await new Promise((resolve) => server.close(resolve));
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    });
    const base = `http://127.0.0.1:${server.address().port}/api/v1`;
    async function account(name) {
      let cookie = "",
        csrf = "";
      const call = async (method, path, body, key = randomUUID()) => {
        const r = await fetch(base + path, {
          method,
          headers: {
            "Content-Type": "application/json",
            Cookie: cookie,
            "X-CSRF-Token": csrf,
            "Idempotency-Key": key,
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        if (r.headers.get("set-cookie"))
          cookie = r.headers.get("set-cookie").split(";")[0];
        const result = await r.json();
        if (result.data?.csrfToken) csrf = result.data.csrfToken;
        return { status: r.status, body: result };
      };
      ok(await call("GET", "/auth/csrf"));
      const { user, patientId } = ok(
        await call("POST", "/auth/register", {
          email: name + "@example.test",
          password: syntheticPassword,
          displayName: name,
        }),
        201,
      );
      const signIn = async () => {
        ok(await call("GET", "/auth/csrf"));
        ok(
          await call("POST", "/auth/login", {
            email: name + "@example.test",
            password: syntheticPassword,
          }),
        );
      };
      return { call, signIn, id: user.id, path: "/patients/" + patientId };
    }
    const owner = await account("Synthetic-A4-owner"),
      caregiver = await account("Synthetic-A4-caregiver"),
      foreign = await account("Synthetic-A4-foreign");
    const p = owner.path,
      prefs = p + "/pharmacy-preferences",
      find = p + "/pharmacies";
    const create = (path, body, key) => owner.call("POST", p + path, body, key);
    const grant = ok(
      await create("/access-grants", {
        userId: caregiver.id,
        permissions: ["stock.read", "task.read", "task.write"],
      }),
      201,
    );
    const item = ok(
      await create("/cabinet-items", {
        entryType: "manual",
        displayName: "Synthetic A4 medicine",
        strengthText: "1 mg",
        form: "tablet",
      }),
      201,
    );
    const itemPath = p + "/cabinet-items/" + item.id;
    ok(
      await owner.call("PUT", itemPath + "/inventory-settings", {
        expectedRevision: null,
        stockUnit: "tablet",
        lowStockThreshold: "2",
      }),
    );
    ok(
      await owner.call("POST", itemPath + "/stock-transactions", {
        expectedRevision: 0,
        delta: "1",
        reason: "opening",
        unit: "tablet",
      }),
      201,
    );
    const list = ok(await create("/refill-lists", { fromLowStock: true }), 201);
    const taskPath = p + "/refill-lists/" + list.id + "/collection-task";
    let preferred;

    await t.test(
      "scoped lookups, no results, timeout, signed selection, expiration and durable preference",
      async () => {
        assert.equal((await foreign.call("GET", find + coords)).status, 404);
        assert.equal(
          (await owner.call("GET", find + coords + "&patient=secret")).status,
          400,
        );
        assert.equal(calls, 0);
        const listing = ok(await owner.call("GET", find + coords)).listings[0];
        const selection = {
          externalPlaceKey: listing.externalPlaceKey,
          selectionToken: listing.selectionToken,
          expectedRevision: null,
        };
        assert.equal(
          (
            await owner.call("POST", prefs, {
              ...selection,
              externalPlaceKey: "node/92",
            })
          ).status,
          409,
        );
        const key = randomUUID();
        preferred = ok(await owner.call("POST", prefs, selection, key), 201);
        assert.equal(preferred.listingSnapshot.phone, "Synthetic contact");
        assert.equal(preferred.listingSnapshot.distanceMeters, undefined);
        assert.equal(preferred.stale, false);
        const crossPatient = await owner.call(
          "POST",
          foreign.path + "/pharmacy-preferences",
          selection,
        );
        assert.equal(crossPatient.status, 404);
        const borrowed = await foreign.call(
          "POST",
          foreign.path + "/pharmacy-preferences",
          selection,
        );
        assert.equal(borrowed.body.error.code, "PHARMACY_SELECTION_EXPIRED");
        clock = new Date(clock.getTime() + 11 * 60000);
        assert.equal(
          (
            await owner.call("POST", prefs, {
              ...selection,
              expectedRevision: 0,
            })
          ).status,
          409,
        );
        unavailable = true;
        const down = await owner.call("GET", find + coords);
        assert.equal(down.status, 503);
        assert.equal(down.body.error.code, "OVERPASS_UNAVAILABLE");
        assert.equal(
          ok(await owner.call("POST", prefs, selection, key)).id,
          preferred.id,
        );
        assert.equal(ok(await owner.call("GET", prefs)).id, preferred.id);
        unavailable = false;
        empty = true;
        assert.deepEqual(
          ok(await owner.call("GET", find + coords)).listings,
          [],
        );
        empty = false;
      },
    );

    await t.test(
      "stale and foreign preferences, unauthorized assignees and both creator permissions",
      async () => {
        const body = {
          expectedRevision: list.revision,
          assigneeUserId: caregiver.id,
          pharmacyPreferenceId: preferred.id,
          expectedPharmacyRevision: preferred.revision,
        };
        assert.equal(
          (await caregiver.call("POST", taskPath, body)).status,
          403,
        );
        assert.equal(
          (
            await owner.call("POST", taskPath, {
              ...body,
              assigneeUserId: foreign.id,
            })
          ).status,
          422,
        );
        clock = new Date(clock.getTime() + 24 * 3600000);
        await owner.signIn();
        await caregiver.signIn();
        assert.equal(ok(await owner.call("GET", prefs)).stale, true);
        const stale = await owner.call("POST", taskPath, body);
        assert.equal(stale.status, 409);
        assert.equal(stale.body.error.code, "PHARMACY_LISTING_STALE");
        const listing = ok(await owner.call("GET", find + coords)).listings[0];
        preferred = ok(
          await owner.call("POST", prefs, {
            externalPlaceKey: listing.externalPlaceKey,
            selectionToken: listing.selectionToken,
            expectedRevision: preferred.revision,
          }),
          201,
        );
        assert.equal(preferred.stale, false);
      },
    );

    await t.test(
      "task, link and C1 event/job roll back, then retries and competing keys create exactly one",
      async () => {
        const body = {
          expectedRevision: list.revision,
          assigneeUserId: caregiver.id,
          pharmacyPreferenceId: preferred.id,
          expectedPharmacyRevision: preferred.revision,
        };
        const previous = db.update;
        db.update = async (name, filter, values, session) => {
          if (name === "RefillList" && values.collectionTaskId)
            throw Error("Injected link failure");
          return previous(name, filter, values, session);
        };
        try {
          assert.equal((await owner.call("POST", taskPath, body)).status, 503);
        } finally {
          db.update = previous;
        }
        for (const model of ["Task", "TaskEvent", "NotificationJob"])
          assert.equal(await db.count(model, {}), 0);
        const key = randomUUID();
        const [first, second, competing] = await Promise.all([
          owner.call("POST", taskPath, body, key),
          owner.call("POST", taskPath, body, key),
          owner.call("POST", taskPath, body),
        ]);
        // A different key can win the race. All successful receipts must identify one task.
        const results = [first, second, competing];
        assert.equal(results.filter((r) => r.status === 201).length, 1);
        const linked = results.find((r) => r.status === 201).body.data;
        assert.ok(
          results.every(
            (r) => r.status === 409 || r.body.data.task.id === linked.task.id,
          ),
        );
        const winningKey = competing.status === 201 ? null : key;
        if (winningKey)
          assert.equal(
            ok(await owner.call("POST", taskPath, body, winningKey)).task.id,
            linked.task.id,
          );
        assert.equal(
          ok(await owner.call("GET", p + "/refill-lists"))[0].collectionTaskId,
          linked.task.id,
        );
        const task = ok(
          await caregiver.call("GET", p + "/tasks/" + linked.task.id),
        );
        assert.equal(task.refillListId, list.id);
        assert.equal(task.pharmacySnapshot.name, "Synthetic pharmacy");
        assert.equal(task.pharmacySnapshot.sourceUrl, overpassUrl);
        assert.doesNotMatch(JSON.stringify(task), /Synthetic A4 medicine/);
        assert.equal(
          ok(await owner.call("GET", itemPath + "/stock")).balance,
          "1",
        );
        assert.equal(await db.count("TaskEvent", { eventType: "created" }), 1);
        assert.equal(
          await db.count("NotificationJob", { status: "disabled" }),
          1,
        );
        ok(
          await create("/access-grants/" + grant.id + "/revoke", {
            expectedRevision: grant.revision,
          }),
          200,
        );
        assert.equal(
          (await caregiver.call("GET", p + "/tasks/" + linked.task.id)).status,
          404,
        );
      },
    );
  },
);
