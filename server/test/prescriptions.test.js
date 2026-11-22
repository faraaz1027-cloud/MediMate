import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import express from "express";
import mongoose from "mongoose";
import { createV1 } from "../v1/app.js";
import { db } from "../v1/store.js";

test(
  "Step 21 prescription review and immutable history",
  { timeout: 90000 },
  async (t) => {
    assert.ok(
      process.env.MONGODB_TEST_URI,
      "Set MONGODB_TEST_URI to a test replica set.",
    );
    await mongoose.connect(process.env.MONGODB_TEST_URI, {
      dbName: "medimate_a1_" + randomUUID().replaceAll("-", ""),
      serverSelectionTimeoutMS: 5000,
    });
    await db.init();
    let server, base;
    async function start() {
      const app = express();
      app.use("/api/v1", createV1({ db }));
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
    const account = await register(owner, "A1Owner"),
      carer = await register(caregiver, "A1Caregiver");
    await register(stranger, "A1Stranger");
    const patient = `/patients/${account.patientId}`,
      route = patient + "/prescriptions";
    const line = {
      lineNumber: 1,
      medicineText: "Synthetic medicine",
      instructionsText: "Synthetic transcription",
      clarificationRequired: false,
      doseQuantity: "1.25",
      doseUnit: "tablet",
      frequencyText: "Synthetic timing from source",
      durationText: "Synthetic duration from source",
    };
    let p, v1, v2;
    await t.test(
      "incomplete/unreviewed drafts cannot confirm or create current pointer",
      async () => {
        const r = await owner.call("POST", route, {
          title: "A1 synthetic",
          instructions: [
            {
              lineNumber: 1,
              medicineText: line.medicineText,
              instructionsText: line.instructionsText,
              clarificationRequired: true,
            },
          ],
        });
        assert.equal(r.status, 201, JSON.stringify(r));
        p = r.body.data.prescription;
        v1 = r.body.data.draftVersion;
        assert.equal(
          (
            await owner.call(
              "POST",
              `${route}/${p.id}/versions/${v1.id}/confirm`,
              { expectedRevision: 0, reviewed: true },
            )
          ).status,
          422,
        );
        assert.equal(
          (
            await owner.call(
              "POST",
              `${route}/${p.id}/versions/${v1.id}/confirm`,
              { expectedRevision: 0, reviewed: false },
            )
          ).status,
          422,
        );
        assert.equal(
          (await owner.call("GET", `${route}/${p.id}`)).body.data
            .currentVersion,
          null,
        );
        for (const omitted of [
          "doseQuantity",
          "frequencyText",
          "durationText",
        ]) {
          const incomplete = { ...line };
          delete incomplete[omitted];
          if (omitted === "doseQuantity") delete incomplete.doseUnit;
          const created = await owner.call("POST", route, {
            instructions: [incomplete],
          });
          assert.equal(
            (
              await owner.call(
                "POST",
                `${route}/${created.body.data.prescription.id}/versions/${created.body.data.draftVersion.id}/confirm`,
                { expectedRevision: 0, reviewed: true },
              )
            ).status,
            422,
          );
        }
      },
    );
    await t.test(
      "draft edit revision, confirmation replay and persistent attribution",
      async () => {
        const edited = await owner.call(
          "PATCH",
          `${route}/${p.id}/versions/${v1.id}`,
          {
            expectedRevision: 0,
            instructions: [line],
            reviewCorrections: "Corrected synthetic draft",
          },
        );
        assert.equal(edited.status, 200, JSON.stringify(edited));
        v1 = edited.body.data.draftVersion;
        p = edited.body.data.prescription;
        assert.equal(
          (
            await owner.call("PATCH", `${route}/${p.id}/versions/${v1.id}`, {
              expectedRevision: 0,
              instructions: [line],
            })
          ).status,
          409,
        );
        const key = randomUUID(),
          body = { expectedRevision: v1.revision, reviewed: true };
        const confirmed = await owner.call(
          "POST",
          `${route}/${p.id}/versions/${v1.id}/confirm`,
          body,
          key,
        );
        assert.equal(confirmed.status, 200, JSON.stringify(confirmed));
        assert.deepEqual(
          (
            await owner.call(
              "POST",
              `${route}/${p.id}/versions/${v1.id}/confirm`,
              body,
              key,
            )
          ).body.data,
          confirmed.body.data,
        );
        p = confirmed.body.data.prescription;
        v1 = confirmed.body.data.currentVersion;
        assert.equal(v1.status, "confirmed");
        assert.equal(v1.confirmedByUserId, account.user.id);
        assert.ok(v1.confirmedAt);
        assert.equal(v1.instructions[0].doseQuantity, "1.25");
        const fresh = (await owner.call("GET", `${route}/${p.id}`)).body.data;
        assert.deepEqual(fresh.currentVersion, v1);
        assert.equal(fresh.draftVersion, null);
      },
    );
    await t.test(
      "confirmed instructions cannot be patched and replacement preserves prior version",
      async () => {
        const snapshot = await mongoose
          .model("PrescriptionInstruction")
          .find({ prescriptionVersionId: v1.id })
          .lean();
        assert.equal(
          (
            await owner.call("PATCH", `${route}/${p.id}/versions/${v1.id}`, {
              expectedRevision: v1.revision,
              instructions: [{ ...line, doseQuantity: "2" }],
            })
          ).status,
          409,
        );
        const key = randomUUID(),
          body = {
            expectedRevision: p.revision,
            previousVersionId: v1.id,
            instructions: [
              { ...line, doseQuantity: "2" },
              { ...line, lineNumber: 2, medicineText: "Second synthetic line" },
            ],
          };
        const next = await owner.call(
          "POST",
          `${route}/${p.id}/versions`,
          body,
          key,
        );
        assert.equal(next.status, 201, JSON.stringify(next));
        assert.deepEqual(
          (await owner.call("POST", `${route}/${p.id}/versions`, body, key))
            .body.data,
          next.body.data,
        );
        v2 = next.body.data.draftVersion;
        p = next.body.data.prescription;
        assert.equal(v2.versionNumber, 2);
        assert.equal(v2.previousVersionId, v1.id);
        assert.deepEqual(
          await mongoose
            .model("PrescriptionInstruction")
            .find({ prescriptionVersionId: v1.id })
            .lean(),
          snapshot,
        );
        assert.equal(
          (await owner.call("POST", `${route}/${p.id}/versions`, body)).status,
          409,
        );
      },
    );
    await t.test(
      "field differences, history cursor and confirmed replacement pointer",
      async () => {
        const diff = await owner.call(
          "GET",
          `${route}/${p.id}/comparison?fromVersionId=${v1.id}&toVersionId=${v2.id}`,
        );
        assert.equal(diff.status, 200);
        assert.equal(diff.body.data.added[0].lineNumber, 2);
        assert.deepEqual(diff.body.data.changed[0].fields, [
          { field: "doseQuantity", before: "1.25", after: "2" },
        ]);
        const first = await owner.call(
          "GET",
          `${route}/${p.id}/versions?limit=1`,
        );
        assert.ok(first.body.meta.nextCursor);
        const second = await owner.call(
          "GET",
          `${route}/${p.id}/versions?limit=1&cursor=${encodeURIComponent(first.body.meta.nextCursor)}`,
        );
        assert.equal(second.body.data[0].id, v1.id);
        assert.equal(
          (await owner.call("GET", `${route}/${p.id}/versions?cursor=invalid`))
            .status,
          400,
        );
        const confirmed = await owner.call(
          "POST",
          `${route}/${p.id}/versions/${v2.id}/confirm`,
          { expectedRevision: 0, reviewed: true },
        );
        assert.equal(confirmed.status, 200);
        p = confirmed.body.data.prescription;
        assert.equal(p.currentVersionId, v2.id);
        const history = (await owner.call("GET", `${route}/${p.id}/versions`))
          .body.data;
        assert.equal(history.length, 2);
        assert.equal(
          history.find((x) => x.id === v1.id).instructions[0].doseQuantity,
          "1.25",
        );
      },
    );
    await t.test(
      "patient/version scoping and independent confirmation permission",
      async () => {
        assert.equal(
          (await stranger.call("GET", `${route}/${p.id}`)).status,
          404,
        );
        const other = await owner.call("POST", route, { instructions: [line] });
        assert.equal(
          (
            await owner.call(
              "GET",
              `${route}/${p.id}/comparison?fromVersionId=${v1.id}&toVersionId=${other.body.data.draftVersion.id}`,
            )
          ).status,
          404,
        );
        const grant = await owner.call("POST", patient + "/access-grants", {
          userId: carer.user.id,
          permissions: ["prescription.read", "prescription.write"],
        });
        assert.equal(grant.status, 201);
        assert.equal(
          (await caregiver.call("GET", `${route}/${p.id}`)).status,
          200,
        );
        assert.equal(
          (
            await caregiver.call(
              "POST",
              `${route}/${other.body.data.prescription.id}/versions/${other.body.data.draftVersion.id}/confirm`,
              { expectedRevision: 0, reviewed: true },
            )
          ).status,
          403,
        );
        await owner.call(
          "POST",
          patient + `/access-grants/${grant.body.data.id}/revoke`,
          { expectedRevision: 0 },
        );
        assert.equal(
          (await caregiver.call("GET", `${route}/${p.id}/versions`)).status,
          404,
        );
        await owner.call(
          "PATCH",
          patient + `/access-grants/${grant.body.data.id}`,
          {
            expectedRevision: 1,
            permissions: ["prescription.read", "prescription.confirm"],
          },
        );
        const approved = await caregiver.call(
          "POST",
          `${route}/${other.body.data.prescription.id}/versions/${other.body.data.draftVersion.id}/confirm`,
          { expectedRevision: 0, reviewed: true },
        );
        assert.equal(approved.status, 200);
        assert.equal(
          approved.body.data.currentVersion.confirmedByUserId,
          carer.user.id,
        );
      },
    );
    await t.test(
      "OCR metadata never confirms; invalid provenance and mass assignment rejected",
      async () => {
        const source = {
          fileName: "synthetic.png",
          mimeType: "image/png",
          sizeBytes: 100,
          sha256: "a".repeat(64),
          ocrText: "unreadable suggestion",
          confidence: 3,
          ocrStatus: "failed",
        };
        const r = await owner.call("POST", route, {
          instructions: [{ ...line, clarificationRequired: true }],
          source,
        });
        assert.equal(r.status, 201);
        const data = r.body.data;
        assert.equal(data.draftVersion.source.ocrText, source.ocrText);
        assert.equal(data.prescription.currentVersionId, undefined);
        assert.equal(
          (
            await owner.call(
              "POST",
              `${route}/${data.prescription.id}/versions/${data.draftVersion.id}/confirm`,
              { expectedRevision: 0, reviewed: true },
            )
          ).status,
          422,
        );
        assert.equal(
          (
            await owner.call("POST", route, {
              instructions: [line],
              source: { ...source, sizeBytes: 6 * 1024 * 1024 },
            })
          ).status,
          422,
        );
        assert.equal(
          (
            await owner.call("POST", route, {
              instructions: [line],
              confirmedAt: new Date().toISOString(),
            })
          ).status,
          422,
        );
        assert.equal(
          (
            await owner.call("POST", route, {
              instructions: [line],
              source: { ...source, sha256: [source.sha256] },
            })
          ).status,
          422,
        );
      },
    );
    await t.test(
      "transaction failure rolls back draft edits and preserves instructions",
      async () => {
        const r = await owner.call("POST", route, { instructions: [line] });
        const d = r.body.data;
        const before = await mongoose
            .model("PrescriptionInstruction")
            .find({ prescriptionVersionId: d.draftVersion.id })
            .lean(),
          original = db.insert;
        try {
          db.insert = async (name, ...args) => {
            if (name === "AuditEvent") throw Error("injected audit failure");
            return original(name, ...args);
          };
          assert.equal(
            (
              await owner.call(
                "PATCH",
                `${route}/${d.prescription.id}/versions/${d.draftVersion.id}`,
                {
                  expectedRevision: 0,
                  instructions: [{ ...line, doseQuantity: "5" }],
                },
              )
            ).status,
            503,
          );
        } finally {
          db.insert = original;
        }
        assert.deepEqual(
          await mongoose
            .model("PrescriptionInstruction")
            .find({ prescriptionVersionId: d.draftVersion.id })
            .lean(),
          before,
        );
        assert.equal(
          (await owner.call("GET", `${route}/${d.prescription.id}`)).body.data
            .draftVersion.revision,
          0,
        );
      },
    );
    await t.test(
      "archive retains versions, rejects edits and supports idempotent replay",
      async () => {
        const body = { expectedRevision: p.revision },
          key = randomUUID();
        assert.equal(
          (await owner.call("POST", `${route}/${p.id}/archive`, body, key))
            .status,
          200,
        );
        assert.equal(
          (await owner.call("POST", `${route}/${p.id}/archive`, body, key))
            .status,
          200,
        );
        assert.equal(
          (await owner.call("GET", `${route}/${p.id}/versions`)).body.data
            .length,
          2,
        );
        assert.equal(
          (
            await owner.call("POST", `${route}/${p.id}/versions`, {
              expectedRevision: p.revision + 1,
              previousVersionId: v2.id,
              instructions: [line],
            })
          ).status,
          409,
        );
      },
    );
    await t.test(
      "concurrent confirmations deduplicate and conflicting payloads cannot rewrite history",
      async () => {
        const r = await owner.call("POST", route, { instructions: [line] });
        const d = r.body.data;
        const confirmPath = `${route}/${d.prescription.id}/versions/${d.draftVersion.id}/confirm`,
          body = { expectedRevision: 0, reviewed: true },
          key = randomUUID();
        const before = await mongoose.model("AuditEvent").countDocuments();
        const results = await Promise.all([
          owner.call("POST", confirmPath, body, key),
          owner.call("POST", confirmPath, body, key),
        ]);
        assert.deepEqual(
          results.map((x) => x.status),
          [200, 200],
        );
        assert.deepEqual(results[0].body.data, results[1].body.data);
        assert.equal(
          await mongoose.model("AuditEvent").countDocuments(),
          before + 1,
        );
        assert.equal(
          (
            await owner.call(
              "POST",
              confirmPath,
              { expectedRevision: 1, reviewed: true },
              key,
            )
          ).status,
          409,
        );
        assert.equal(
          (await owner.call("GET", `${route}/${d.prescription.id}`)).body.data
            .currentVersion.revision,
          1,
        );
      },
    );
    await t.test(
      "API restart preserves confirmed history and sessions",
      async () => {
        await new Promise((r) => server.close(r));
        await start();
        const history = await owner.call("GET", `${route}/${p.id}/versions`);
        assert.equal(history.status, 200);
        assert.equal(
          history.body.data.find((x) => x.id === v1.id).instructions[0]
            .doseQuantity,
          "1.25",
        );
        assert.equal(
          (await owner.call("GET", `${route}/${p.id}`)).body.data.prescription
            .currentVersionId,
          v2.id,
        );
      },
    );
  },
);
