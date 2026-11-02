import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import express from "express";
import mongoose from "mongoose";
import { createV1 } from "../v1/app.js";
import { db } from "../v1/store.js";
import { generateOccurrences } from "../v1/schedule-time.js";

test(
  "Step 25 real-database schedule integration",
  { timeout: 90000 },
  async (t) => {
    await mongoose.connect(process.env.MONGODB_TEST_URI, {
      dbName: "a2_" + randomUUID().replaceAll("-", ""),
    });
    await db.init();
    let clock = new Date("2026-11-02T00:00:00Z"),
      server,
      base;
    async function start() {
      const app = express();
      app.use("/api/v1", createV1({ db, now: () => new Date(clock) }));
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
    const ok = (r, status = 200) => {
      assert.equal(r.status, status, JSON.stringify(r.body));
      return r.body.data;
    };
    async function register(c, name) {
      await c.call("GET", "/auth/csrf");
      return ok(
        await c.call("POST", "/auth/register", {
          email: name + "@example.test",
          password: "Synthetic-pass-123!",
          displayName: name,
        }),
        201,
      );
    }
    const owner = client(),
      reader = client(),
      stranger = client(),
      a = await register(owner, "A2Owner"),
      b = await register(reader, "A2Reader");
    await register(stranger, "A2Stranger");
    const p = `/patients/${a.patientId}`;
    const cabinet = ok(
      await owner.call("POST", p + "/cabinet-items", {
        entryType: "manual",
        displayName: "Synthetic A2 medicine",
        strengthText: "500 mg",
        form: "tablet",
      }),
      201,
    );
    const line = {
      lineNumber: 1,
      cabinetItemId: cabinet.id,
      medicineText: "Synthetic A2 medicine",
      strengthText: "500 mg",
      instructionsText: "Synthetic course only",
      doseQuantity: "1.25",
      doseUnit: "tablet",
      frequencyText: "08:00 daily",
      durationText: "Three days",
      clarificationRequired: false,
    };
    const draft = ok(
      await owner.call("POST", p + "/prescriptions", {
        title: "A2 source",
        instructions: [line],
      }),
      201,
    );
    const confirmed = ok(
      await owner.call(
        "POST",
        `${p}/prescriptions/${draft.prescription.id}/versions/${draft.draftVersion.id}/confirm`,
        { expectedRevision: 0, reviewed: true },
      ),
      200,
    );
    const instruction = confirmed.currentVersion.instructions[0];
    const input = {
      prescriptionInstructionId: instruction.id,
      cabinetItemId: cabinet.id,
      timingMode: "fixed_times",
      timezone: "Asia/Dhaka",
      doseQuantity: "1.25",
      doseUnit: "tablet",
      effectiveFromUTC: "2026-11-03T00:00:00Z",
      endAtUTC: "2026-11-06T00:00:00Z",
      localTimes: ["08:00"],
      reviewedAgainstSource: true,
    };
    const preview = async (body) =>
      ok(await owner.call("POST", p + "/schedule-previews", body));
    let saved, firstVersion, firstEvents;

    await t.test(
      "preview requires reviewed current source, matching quantity, unambiguous bounded timing and same-patient cabinet",
      async () => {
        const invalids = [
          { reviewedAgainstSource: false },
          { doseQuantity: "500" },
          { doseUnit: "mg" },
          { localTimes: ["08:00", "08:00"] },
          { timezone: "Bad/Zone" },
          { effectiveFromUTC: "2026-11-03T00:00:00" },
          { effectiveFromUTC: "2026-11-03T00:00:60Z" },
          { endAtUTC: "2026-11-03T00:00:00Z" },
          { endAtUTC: "2027-11-06T00:00:00Z" },
          { timingMode: "as_needed" },
          { intervalMinutes: 60 },
          { prescriptionInstructionId: draft.draftVersion.id },
          { cabinetItemId: new mongoose.Types.ObjectId().toString() },
          {
            timingMode: "interval",
            localTimes: undefined,
            intervalMinutes: 1,
            anchorAtUTC: input.effectiveFromUTC,
          },
        ];
        for (const patch of invalids)
          assert.equal(
            (
              await owner.call("POST", p + "/schedule-previews", {
                ...input,
                ...patch,
              })
            ).status,
            422,
            JSON.stringify(patch),
          );
        assert.equal(await mongoose.model("Schedule").countDocuments(), 0);
        const pr = await preview(input);
        assert.equal(pr.occurrenceCount, 3);
        assert.equal(pr.occurrences[0], "2026-11-03T02:00:00.000Z");
        assert.equal(pr.sourceSnapshot.strengthText, "500 mg");
        assert.equal(pr.input.doseQuantity, "1.25");
        assert.equal(
          await mongoose.model("DoseOccurrence").countDocuments(),
          0,
        );
        const tokenDoc = await mongoose
          .model("SchedulePreview")
          .findOne({ tokenHash: { $exists: true } })
          .lean();
        assert.ok(!JSON.stringify(tokenDoc).includes(pr.previewToken));
      },
    );
    await t.test(
      "DST overlaps and gaps reject; fixed local time crosses DST while interval preserves elapsed minutes",
      async () => {
        for (const patch of [
          {
            timezone: "America/New_York",
            effectiveFromUTC: "2027-03-14T00:00:00Z",
            endAtUTC: "2027-03-15T00:00:00Z",
            localTimes: ["02:30"],
          },
          {
            timezone: "America/New_York",
            effectiveFromUTC: "2027-11-07T00:00:00Z",
            endAtUTC: "2027-11-08T00:00:00Z",
            localTimes: ["01:30"],
          },
        ])
          assert.equal(
            (
              await owner.call("POST", p + "/schedule-previews", {
                ...input,
                ...patch,
              })
            ).status,
            422,
          );
        const fixed = await preview({
          ...input,
          timezone: "America/New_York",
          effectiveFromUTC: "2027-03-13T00:00:00Z",
          endAtUTC: "2027-03-16T00:00:00Z",
          localTimes: ["08:00"],
        });
        assert.deepEqual(fixed.occurrences, [
          "2027-03-13T13:00:00.000Z",
          "2027-03-14T12:00:00.000Z",
          "2027-03-15T12:00:00.000Z",
        ]);
        const interval = await preview({
          ...input,
          timingMode: "interval",
          timezone: "America/New_York",
          effectiveFromUTC: "2027-03-13T13:00:00Z",
          endAtUTC: "2027-03-16T13:00:00Z",
          localTimes: undefined,
          intervalMinutes: 1440,
          anchorAtUTC: "2027-03-13T13:00:00Z",
        });
        assert.deepEqual(interval.occurrences, [
          "2027-03-13T13:00:00.000Z",
          "2027-03-14T13:00:00.000Z",
          "2027-03-15T13:00:00.000Z",
        ]);
        assert.deepEqual(
          generateOccurrences({
            ...input,
            effectiveFromUTC: "2026-11-02T17:00:00Z",
            endAtUTC: "2026-11-03T19:00:00Z",
            localTimes: ["00:00"],
          }),
          ["2026-11-02T18:00:00.000Z", "2026-11-03T18:00:00.000Z"],
        );
      },
    );
    await t.test(
      "expired/foreign preview and source change cannot create a schedule",
      async () => {
        const pr = await preview(input);
        clock = new Date("2026-11-02T00:16:00Z");
        assert.equal(
          (
            await owner.call("POST", p + "/schedules", {
              previewToken: pr.previewToken,
              confirmed: true,
            })
          ).body.error.code,
          "PREVIEW_EXPIRED",
        );
        clock = new Date("2026-11-02T00:00:00Z");
        const pr2 = await preview(input);
        const grant = ok(
          await owner.call("POST", p + "/access-grants", {
            userId: b.user.id,
            permissions: [
              "schedule.read",
              "schedule.write",
              "prescription.read",
              "cabinet.read",
            ],
          }),
          201,
        );
        assert.equal(
          (
            await reader.call("POST", p + "/schedules", {
              previewToken: pr2.previewToken,
              confirmed: true,
            })
          ).body.error.code,
          "PREVIEW_EXPIRED",
        );
        await db.update(
          "CabinetItem",
          { _id: cabinet.id },
          { strengthText: "500 mg reviewed" },
        );
        assert.equal(
          (
            await owner.call("POST", p + "/schedules", {
              previewToken: pr2.previewToken,
              confirmed: true,
            })
          ).body.error.code,
          "SOURCE_CHANGED",
        );
        assert.equal(await mongoose.model("Schedule").countDocuments(), 0);
        assert.equal(
          (await stranger.call("POST", p + "/schedule-previews", input)).status,
          404,
        );
        // Reader can inspect saved schedules later, without access to full A1/B1 records.
        ok(
          await owner.call("PATCH", `${p}/access-grants/${grant.id}`, {
            expectedRevision: grant.revision,
            permissions: ["schedule.read"],
          }),
        );
        assert.equal(
          (await reader.call("POST", p + "/schedule-previews", input)).status,
          403,
        );
      },
    );
    await t.test(
      "confirmation/replay is atomic; single-use token and unique source prevent duplicate generation",
      async () => {
        const pr = await preview(input),
          key = randomUUID(),
          body = { previewToken: pr.previewToken, confirmed: true };
        assert.equal(
          (
            await owner.call("POST", p + "/schedules", {
              ...body,
              confirmed: false,
            })
          ).status,
          422,
        );
        const replies = await Promise.all([
          owner.call("POST", p + "/schedules", body, key),
          owner.call("POST", p + "/schedules", body, key),
        ]);
        assert.deepEqual(replies.map((x) => x.status).sort(), [200, 201]);
        saved = replies[0].body.data.schedule;
        firstVersion = replies[0].body.data.version;
        assert.equal(await mongoose.model("Schedule").countDocuments(), 1);
        assert.equal(
          await mongoose.model("DoseOccurrence").countDocuments(),
          3,
        );
        firstEvents = ok(
          await owner.call(
            "GET",
            `${p}/schedules/${saved.id}/occurrences?view=history`,
          ),
        );
        assert.deepEqual(
          firstEvents.map((x) => x.dueAtUTC),
          generateOccurrences({ ...input }),
        );
        assert.equal(
          (await owner.call("POST", p + "/schedules", body)).status,
          409,
        );
        const duplicate = await preview(input);
        assert.equal(
          (
            await owner.call("POST", p + "/schedules", {
              previewToken: duplicate.previewToken,
              confirmed: true,
            })
          ).status,
          409,
        );
        assert.equal(
          await mongoose.model("DoseOccurrence").countDocuments(),
          3,
        );
        const r = ok(await reader.call("GET", `${p}/schedules/${saved.id}`));
        assert.equal(r.version.sourceSnapshot.medicineText, line.medicineText);
        assert.equal(
          (
            await reader.call("POST", `${p}/schedules/${saved.id}/pause`, {
              expectedRevision: saved.revision,
            })
          ).status,
          403,
        );
        assert.equal(
          (await stranger.call("GET", `${p}/schedules/${saved.id}`)).status,
          404,
        );
        const otherPatient = ok(
          await owner.call("POST", "/patients", {
            displayName: "Other synthetic",
            timezone: "UTC",
          }),
          201,
        );
        assert.equal(
          (
            await owner.call(
              "GET",
              `/patients/${otherPatient.id}/schedules/${saved.id}`,
            )
          ).status,
          404,
        );
        assert.equal(
          (await owner.call("GET", `${p}/schedules?limit=0`)).status,
          400,
        );
        const model = mongoose.model("DoseOccurrence"),
          duplicateRow = await model.findById(firstEvents[0].id).lean();
        delete duplicateRow._id;
        await assert.rejects(
          () => model.create(duplicateRow),
          (e) => e.code === 11000,
        );
      },
    );
    await t.test(
      "version edit preserves past and acted events, cancels only pending future, no partial stale writes",
      async () => {
        clock = new Date("2026-11-04T00:00:00Z");
        // Advance the test clock without pretending an expired login stays valid.
        await owner.call("GET", "/auth/csrf");
        ok(
          await owner.call("POST", "/auth/login", {
            email: "A2Owner@example.test",
            password: "Synthetic-pass-123!",
          }),
        );
        await db.update(
          "DoseOccurrence",
          { _id: firstEvents[2].id },
          { state: "taken", actionRevision: 1 },
        );
        const editInput = {
          ...input,
          scheduleId: saved.id,
          expectedRevision: saved.revision,
          effectiveFromUTC: "2026-11-04T00:01:00Z",
          endAtUTC: "2026-11-07T00:00:00Z",
          localTimes: ["09:00"],
        };
        const pr = await preview(editInput),
          body = {
            expectedRevision: saved.revision,
            previewToken: pr.previewToken,
            confirmed: true,
          };
        const replacement = ok(
          await owner.call("POST", `${p}/schedules/${saved.id}/versions`, body),
          201,
        );
        saved = replacement.schedule;
        assert.equal(replacement.version.versionNumber, 2);
        assert.equal(
          (await db.one("DoseOccurrence", { _id: firstEvents[0].id })).state,
          "pending",
        );
        assert.equal(
          (await db.one("DoseOccurrence", { _id: firstEvents[1].id })).state,
          "cancelled",
        );
        assert.equal(
          (await db.one("DoseOccurrence", { _id: firstEvents[2].id })).state,
          "taken",
        );
        assert.equal(
          await mongoose.model("ScheduleVersion").countDocuments(),
          2,
        );
        assert.equal(
          (
            await owner.call(
              "POST",
              `${p}/schedules/${saved.id}/versions`,
              body,
            )
          ).status,
          409,
        );
        const persisted = ok(
          await owner.call("GET", `${p}/schedules/${saved.id}/versions`),
        );
        assert.deepEqual(
          persisted.find((x) => x.id === firstVersion.id),
          firstVersion,
        );
        const one = await owner.call(
          "GET",
          `${p}/schedules/${saved.id}/occurrences?view=history&limit=2`,
        );
        assert.ok(one.body.meta.nextCursor);
        const two = ok(
          await owner.call(
            "GET",
            `${p}/schedules/${saved.id}/occurrences?view=history&limit=2&cursor=${one.body.meta.nextCursor}`,
          ),
        );
        assert.ok(two.every((x) => !one.body.data.some((y) => x.id === y.id)));
      },
    );
    await t.test(
      "pause/resume retain history, skip elapsed events and restore without duplicate rows",
      async () => {
        const initialCount = await mongoose
          .model("DoseOccurrence")
          .countDocuments();
        const paused = ok(
          await owner.call("POST", `${p}/schedules/${saved.id}/pause`, {
            expectedRevision: saved.revision,
            reason: "Synthetic pause",
          }),
        );
        assert.equal(paused.status, "paused");
        assert.equal(
          ok(await owner.call("GET", `${p}/schedules/${saved.id}/occurrences`))
            .length,
          0,
        );
        assert.equal(
          (await db.one("DoseOccurrence", { _id: firstEvents[0].id })).state,
          "pending",
        );
        assert.equal(
          (await db.one("DoseOccurrence", { _id: firstEvents[2].id })).state,
          "taken",
        );
        const body = {
            expectedRevision: paused.revision,
            effectiveFromUTC: "2026-11-05T00:00:00Z",
          },
          key = randomUUID();
        saved = ok(
          await owner.call(
            "POST",
            `${p}/schedules/${saved.id}/resume`,
            body,
            key,
          ),
        );
        ok(
          await owner.call(
            "POST",
            `${p}/schedules/${saved.id}/resume`,
            body,
            key,
          ),
        );
        assert.equal(
          await mongoose.model("DoseOccurrence").countDocuments(),
          initialCount,
        );
        const pending = ok(
          await owner.call("GET", `${p}/schedules/${saved.id}/occurrences`),
        );
        assert.equal(pending.length, 2);
        assert.ok(pending.every((x) => x.dueAtUTC >= body.effectiveFromUTC));
        assert.equal(
          (await db.one("DoseOccurrence", { _id: firstEvents[1].id }))
            .cancellationReason,
          "replaced",
        );
      },
    );
    await t.test(
      "write failure rolls back version, preview consumption, cancellations and operation",
      async () => {
        const pr = await preview({
          ...input,
          scheduleId: saved.id,
          expectedRevision: saved.revision,
          effectiveFromUTC: "2026-11-05T00:00:00Z",
          localTimes: ["10:00"],
        });
        const insertMany = db.insertMany;
        db.insertMany = async (name, ...args) => {
          if (name === "DoseOccurrence")
            throw Error("Injected transaction failure");
          return insertMany(name, ...args);
        };
        let r;
        try {
          r = await owner.call("POST", `${p}/schedules/${saved.id}/versions`, {
            expectedRevision: saved.revision,
            previewToken: pr.previewToken,
            confirmed: true,
          });
        } finally {
          db.insertMany = insertMany;
        }
        assert.equal(r.status, 503);
        assert.equal(
          await mongoose.model("ScheduleVersion").countDocuments(),
          2,
        );
        assert.equal(
          (await db.one("Schedule", { _id: saved.id })).revision,
          saved.revision,
        );
        assert.equal(
          ok(await owner.call("GET", `${p}/schedules/${saved.id}/occurrences`))
            .length,
          2,
        );
      },
    );
    await t.test(
      "restart preserves immutable versions and persisted upcoming events",
      async () => {
        const before = ok(
          await owner.call("GET", `${p}/schedules/${saved.id}/occurrences`),
        );
        await new Promise((r) => server.close(r));
        await start();
        assert.deepEqual(
          ok(await owner.call("GET", `${p}/schedules/${saved.id}/occurrences`)),
          before,
        );
        assert.equal(
          ok(await owner.call("GET", `${p}/schedules/${saved.id}/versions`))
            .length,
          2,
        );
        assert.ok(
          await mongoose
            .model("AuditEvent")
            .countDocuments({ action: /schedules/ }),
        );
      },
    );
    await t.test(
      "changed source blocks resume; paused schedule can be explicitly replaced with an interval version",
      async () => {
        const paused = ok(
          await owner.call("POST", `${p}/schedules/${saved.id}/pause`, {
            expectedRevision: saved.revision,
          }),
        );
        await db.update(
          "CabinetItem",
          { _id: cabinet.id },
          { strengthText: "Synthetic source re-reviewed" },
        );
        assert.equal(
          (
            await owner.call("POST", `${p}/schedules/${saved.id}/resume`, {
              expectedRevision: paused.revision,
              effectiveFromUTC: "2026-11-05T00:00:00Z",
            })
          ).body.error.code,
          "SOURCE_CHANGED",
        );
        const pr = await preview({
          ...input,
          scheduleId: saved.id,
          expectedRevision: paused.revision,
          timezone: "UTC",
          timingMode: "interval",
          localTimes: undefined,
          effectiveFromUTC: "2026-11-05T00:00:00Z",
          intervalMinutes: 720,
          anchorAtUTC: "2026-11-05T00:00:00Z",
        });
        saved = ok(
          await owner.call("POST", `${p}/schedules/${saved.id}/versions`, {
            expectedRevision: paused.revision,
            previewToken: pr.previewToken,
            confirmed: true,
          }),
          201,
        ).schedule;
        const pausedAgain = ok(
          await owner.call("POST", `${p}/schedules/${saved.id}/pause`, {
            expectedRevision: saved.revision,
          }),
        );
        saved = ok(
          await owner.call("POST", `${p}/schedules/${saved.id}/resume`, {
            expectedRevision: pausedAgain.revision,
            effectiveFromUTC: "2026-11-05T00:00:00Z",
          }),
        );
        assert.equal(saved.status, "active");
        assert.deepEqual(
          ok(
            await owner.call("GET", `${p}/schedules/${saved.id}/occurrences`),
          ).map((x) => x.dueAtUTC),
          pr.occurrences,
        );
        assert.equal(
          (await db.one("DoseOccurrence", { _id: firstEvents[0].id }))
            .timezoneSnapshot,
          "Asia/Dhaka",
        );
      },
    );
    await t.test(
      "concurrent source archive conflicts with confirmation instead of committing stale source",
      async () => {
        const pr = await preview({
          ...input,
          scheduleId: saved.id,
          expectedRevision: saved.revision,
          effectiveFromUTC: "2026-11-05T00:00:00Z",
        });
        const original = db.fence;
        let archived = false;
        db.fence = async (name, filter, session) => {
          if (name === "Prescription" && !archived) {
            archived = true;
            const sourceParent = await db.one("Prescription", {
              _id: draft.prescription.id,
            });
            ok(
              await owner.call(
                "POST",
                `${p}/prescriptions/${draft.prescription.id}/archive`,
                { expectedRevision: sourceParent.revision },
              ),
            );
          }
          return original(name, filter, session);
        };
        let reply;
        try {
          reply = await owner.call(
            "POST",
            `${p}/schedules/${saved.id}/versions`,
            {
              expectedRevision: saved.revision,
              previewToken: pr.previewToken,
              confirmed: true,
            },
          );
        } finally {
          db.fence = original;
        }
        assert.equal(reply.status, 422, JSON.stringify(reply));
        assert.equal(
          await mongoose.model("ScheduleVersion").countDocuments(),
          3,
        );
        assert.equal(
          (await db.one("Schedule", { _id: saved.id })).revision,
          saved.revision,
        );
      },
    );
  },
);
