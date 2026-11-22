import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import express from "express";
import mongoose from "mongoose";
import { createV1 } from "../v1/app.js";
import { db } from "../v1/store.js";
import {
  seedDoseSchedule,
  expectStatus as ok,
  syntheticPassword,
} from "../../verification/step27/fixture.mjs";

test(
  "Step 30 stock ledger, dose transactions and refill checklists on MongoDB",
  { timeout: 90000 },
  async (t) => {
    await mongoose.connect(process.env.MONGODB_TEST_URI, {
      dbName: "a3_" + randomUUID().replaceAll("-", ""),
    });
    await db.init();
    let clock = new Date("2026-11-06T03:00:00Z");
    const app = express();
    app.use(
      "/api/v1",
      createV1({
        db,
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
    function client() {
      let cookie = "",
        csrf = "";
      return {
        async call(method, path, body, key = randomUUID()) {
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
          const b = await r.json();
          if (b.data?.csrfToken) csrf = b.data.csrfToken;
          return { status: r.status, body: b };
        },
      };
    }
    async function register(c, name) {
      ok(await c.call("GET", "/auth/csrf"));
      return ok(
        await c.call("POST", "/auth/register", {
          email: name.toLowerCase().replaceAll(" ", "-") + "@example.test",
          password: syntheticPassword,
          displayName: name,
        }),
        201,
      );
    }
    const owner = client(),
      caregiver = client(),
      stranger = client();
    const a = await register(owner, "Synthetic stock owner");
    const b = await register(caregiver, "Synthetic stock caregiver");
    const foreign = await register(stranger, "Synthetic foreign stock owner");
    const p = "/patients/" + a.patientId;
    const seed = await seedDoseSchedule(owner, p, clock);
    const item = p + "/cabinet-items/" + seed.cabinet.id;
    const doses = seed.occurrences;
    clock = new Date(seed.start.getTime() + 25 * 60000);
    const getStock = async (path = item) =>
      ok(await owner.call("GET", path + "/stock"));
    const ledger = async () =>
      ok(await owner.call("GET", item + "/stock-transactions"));
    const act = (dose, suffix, body, key = randomUUID(), who = owner) =>
      who.call(
        "POST",
        p + "/doses/" + dose.id + "/" + suffix,
        { ...body, clientRequestId: key },
        key,
      );
    const taken = (dose, key, who, expectedRevision = 0) =>
      act(dose, "actions", { action: "taken", expectedRevision }, key, who);
    const correction = (dose, expectedRevision, newState) =>
      act(dose, "corrections", {
        expectedRevision,
        newState,
        reason: "Synthetic recorded correction",
      });
    const setStock = (
      path,
      expectedRevision,
      stockUnit = "tablet",
      lowStockThreshold = "1.5",
    ) =>
      owner.call("PUT", path + "/inventory-settings", {
        expectedRevision,
        stockUnit,
        lowStockThreshold,
      });
    const entry = (path, revision, reason, delta, note) =>
      owner.call("POST", path + "/stock-transactions", {
        expectedRevision: revision,
        reason,
        delta,
        unit: "tablet",
        ...(note === undefined ? {} : { note }),
      });
    const grant = ok(
      await owner.call("POST", p + "/access-grants", {
        userId: b.user.id,
        permissions: ["dose.read", "dose.record", "stock.read"],
      }),
      201,
    );
    let debit;

    await t.test(
      "opening, coverage, decimal validation and scoped reads",
      async () => {
        assert.equal((await getStock()).balance, null);
        assert.equal((await getStock()).coverageStatus, "unavailable");
        assert.equal(
          (
            await stranger.call(
              "GET",
              "/patients/" +
                foreign.patientId +
                "/cabinet-items/" +
                seed.cabinet.id +
                "/stock",
            )
          ).status,
          404,
        );
        assert.equal((await stranger.call("GET", item + "/stock")).status, 404);
        assert.equal((await setStock(item, null, "tablet", "-1")).status, 422);
        const settings = ok(await setStock(item, null));
        assert.equal(
          (await entry(item, settings.revision, "opening", "1e3")).status,
          422,
        );
        ok(await entry(item, settings.revision, "opening", "2.250000"), 201);
        const stock = await getStock();
        assert.equal(stock.balance, "2.25");
        assert.equal(stock.coverageStatus, "first_uncovered");
        assert.equal(stock.firstUncoveredAtUTC, doses[5].dueAtUTC);
        assert.equal(
          (await setStock(item, stock.revision, "capsule")).status,
          409,
        );
        assert.equal(
          (await entry(item, stock.revision, "refill", "-1")).status,
          422,
        );
        assert.equal(
          (await entry(item, stock.revision, "correction", "-1")).status,
          422,
        );
        assert.equal(
          (
            await entry(
              item,
              stock.revision,
              "correction",
              "-3",
              "Synthetic correction",
            )
          ).status,
          409,
        );
        assert.equal(
          (await entry(item, stock.revision, "dose_deduction", "1")).status,
          422,
        );
        assert.equal(
          (
            await caregiver.call("PUT", item + "/inventory-settings", {
              expectedRevision: stock.revision,
              stockUnit: "tablet",
              lowStockThreshold: "0",
            })
          ).status,
          403,
        );
        assert.equal(
          ok(await caregiver.call("GET", item + "/stock")).balance,
          "2.25",
        );
      },
    );

    await t.test(
      "a fault after the debit rolls back balance, ledger and dose together",
      async () => {
        const insert = db.insert;
        db.insert = (...args) => {
          if (args[0] === "DoseAction")
            throw Error("Synthetic failure after stock debit");
          return insert(...args);
        };
        try {
          assert.equal((await taken(doses[0])).status, 503);
        } finally {
          db.insert = insert;
        }
        assert.equal((await getStock()).balance, "2.25");
        assert.equal((await ledger()).length, 1);
        const detail = ok(await owner.call("GET", p + "/doses/" + doses[0].id));
        assert.equal(detail.dose.state, "pending");
      },
    );

    await t.test(
      "concurrent distinct doses and duplicate submissions deduct once each",
      async () => {
        const key = randomUUID();
        const results = (
          await Promise.all([
            taken(doses[0], key),
            taken(doses[1], undefined, caregiver),
            taken(doses[0], key),
          ])
        ).map((r) => ok(r));
        assert.ok(results.every((r) => r.stockSyncStatus === "applied"));
        assert.equal(results[0].actionId, results[2].actionId);
        const history = await ledger();
        const debits = history.filter((r) => r.reason === "dose_deduction");
        assert.equal(debits.length, 2);
        debit = debits.find(
          (r) => r.sourceDoseActionId === results[0].actionId,
        );
        assert.equal(debit.delta, "-1");
        assert.equal(
          debits.find((r) => r.sourceDoseActionId === results[1].actionId)
            .actorUserId,
          b.user.id,
        );
        assert.equal((await getStock()).balance, "0.25");
        assert.equal((await taken(doses[0])).status, 409);
      },
    );

    await t.test(
      "insufficient stock preserves the dose and explicit retry uses the current action",
      async () => {
        const result = ok(await taken(doses[2]));
        assert.equal(result.dose.state, "taken");
        assert.equal(result.stockSyncStatus, "needs_review");
        assert.equal(
          (await getStock()).pendingDeductions[0].stockIssue,
          "INSUFFICIENT_STOCK",
        );
        assert.equal((await getStock()).coverageStatus, "unavailable");
        const adjusted = ok(await correction(doses[0], 1, "skipped"));
        const reversal = (await ledger()).find(
          (r) => r.reason === "dose_reversal",
        );
        assert.equal(reversal.reversesTransactionId, debit.id);
        assert.equal(reversal.sourceDoseActionId, adjusted.actionId);
        assert.equal(reversal.delta, "1");
        assert.equal((await getStock()).balance, "1.25");
        const retryPath = item + "/stock-reconciliation/" + doses[2].id;
        const body = { expectedActionRevision: 1 };
        assert.equal(
          (await caregiver.call("POST", retryPath, body)).status,
          403,
        );
        const key = randomUUID();
        const tries = await Promise.all([
          owner.call("POST", retryPath, body, key),
          owner.call("POST", retryPath, body, key),
        ]);
        assert.ok(tries.every((r) => ok(r).stockSyncStatus === "applied"));
        assert.equal((await owner.call("POST", retryPath, body)).status, 409);
        assert.equal(
          (await ledger()).filter(
            (r) => r.sourceDoseActionId === result.actionId,
          ).length,
          1,
        );
        assert.equal((await getStock()).balance, "0.25");
        ok(await correction(doses[2], 1, "pending"));
        assert.equal((await owner.call("POST", retryPath, body)).status, 409);
        assert.equal(
          ok(await taken(doses[2], undefined, owner, 2)).stockSyncStatus,
          "applied",
        );
        assert.equal((await getStock()).balance, "0.25");
      },
    );

    await t.test(
      "threshold checklist collection and completion have zero stock effect",
      async () => {
        const before = await getStock();
        assert.equal(before.lowStock, true);
        const saved = ok(
          await owner.call("POST", p + "/refill-lists", { fromLowStock: true }),
          201,
        );
        assert.equal(saved.items.length, 1);
        assert.equal(saved.items[0].cabinetItemId.toString(), seed.cabinet.id);
        assert.equal(saved.items[0].state, "needed");
        const list = p + "/refill-lists/" + saved.id;
        assert.equal(
          (
            await owner.call("POST", list + "/complete", {
              expectedRevision: saved.revision,
            })
          ).status,
          409,
        );
        const updated = ok(
          await owner.call("PATCH", list + "/items/" + saved.items[0].id, {
            expectedRevision: saved.revision,
            state: "collected",
            requestedQuantity: "3.5",
          }),
        );
        assert.equal(updated.items[0].requestedQuantity, "3.5");
        const complete = ok(
          await owner.call("POST", list + "/complete", {
            expectedRevision: updated.revision,
          }),
        );
        assert.equal(complete.status, "completed");
        assert.equal((await getStock()).balance, before.balance);
        assert.equal(
          ok(await owner.call("GET", p + "/refill-lists"))[0].id,
          saved.id,
        );
        assert.equal(
          (
            await owner.call("POST", p + "/refill-lists", {
              items: [{ cabinetItemId: seed.cabinet.id, unit: "mL" }],
            })
          ).status,
          422,
        );
      },
    );

    await t.test(
      "fractional refills, concurrent negative corrections and schedule pause",
      async () => {
        const before = await getStock();
        const refill = ok(
          await entry(item, before.revision, "refill", "0.15"),
          201,
        );
        assert.equal(refill.stock.balance, "0.4");
        const updates = await Promise.all(
          [1, 2].map(() =>
            entry(
              item,
              refill.stock.revision,
              "correction",
              "-0.3",
              "Count adjustment",
            ),
          ),
        );
        assert.deepEqual(updates.map((r) => r.status).sort(), [201, 409]);
        assert.equal((await getStock()).balance, "0.1");
        const entries = await ledger();
        assert.equal(
          entries.reduce((sum, r) => sum + Number(r.delta), 0).toFixed(6),
          "0.100000",
        );
        const page = await owner.call(
          "GET",
          item + "/stock-transactions?limit=1",
        );
        const next = ok(
          await owner.call(
            "GET",
            item +
              "/stock-transactions?limit=1&cursor=" +
              page.body.meta.nextCursor,
          ),
        );
        assert.notEqual(next[0].id, ok(page)[0].id);
        assert.equal((await getStock()).coverageStatus, "first_uncovered");
        ok(
          await owner.call(
            "POST",
            p + "/schedules/" + seed.schedule.id + "/pause",
            { expectedRevision: seed.schedule.revision },
          ),
        );
        assert.equal((await getStock()).coverageStatus, "unavailable");
      },
    );

    await t.test(
      "legacy and incompatible doses preserve history and archived items cannot generate low-stock lists",
      async () => {
        const other = await seedDoseSchedule(
          owner,
          p,
          clock,
          "Synthetic incompatible stock",
        );
        const otherItem = p + "/cabinet-items/" + other.cabinet.id;
        const setup = ok(await setStock(otherItem, null, "mL"));
        ok(
          await owner.call("POST", otherItem + "/stock-transactions", {
            expectedRevision: setup.revision,
            reason: "opening",
            delta: "0",
            unit: "mL",
          }),
          201,
        );
        clock = new Date(other.start.getTime() + 11 * 60000);
        assert.equal(
          ok(await taken(other.occurrences[0])).stockSyncStatus,
          "needs_review",
        );
        assert.equal(
          (await getStock(otherItem)).pendingDeductions[0].stockIssue,
          "UNIT_OR_QUANTITY_UNAVAILABLE",
        );
        const old = other.occurrences[1];
        await mongoose
          .model("DoseOccurrence")
          .updateOne({ _id: old.id }, { state: "taken", actionRevision: 1 });
        assert.equal(
          ok(await owner.call("GET", p + "/doses/" + old.id)).dose
            .stockSyncStatus,
          "legacy_untracked",
        );
        ok(await correction(old, 1, "skipped"));
        assert.equal(
          ok(await owner.call("GET", otherItem + "/stock-transactions")).length,
          1,
        );
        ok(
          await owner.call("POST", otherItem + "/archive", {
            expectedRevision: other.cabinet.revision,
          }),
          200,
        );
        const generated = ok(
          await owner.call("POST", p + "/refill-lists", { fromLowStock: true }),
          201,
        );
        assert.deepEqual(
          generated.items.map((x) => String(x.cabinetItemId)),
          [seed.cabinet.id],
        );
        assert.equal((await getStock(otherItem)).itemStatus, "archived");
        ok(
          await owner.call(
            "POST",
            p + "/access-grants/" + grant.id + "/revoke",
            { expectedRevision: grant.revision },
          ),
        );
        assert.equal(
          (await caregiver.call("GET", item + "/stock")).status,
          404,
        );
      },
    );
  },
);
