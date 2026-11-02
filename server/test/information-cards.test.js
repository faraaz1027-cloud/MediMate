import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import express from "express";
import mongoose from "mongoose";
import { createV1 } from "../v1/app.js";
import { db } from "../v1/store.js";
import {
  openFDAFixture,
  fixtureId,
  wrongId,
} from "../../verification/step26/fixture.mjs";
import { createRxNorm } from "../v1/rxnorm.js";

test(
  "Step 26 sourced card and separate notes, real Express/MongoDB with controlled providers",
  { timeout: 90000 },
  async (t) => {
    await mongoose.connect(process.env.MONGODB_TEST_URI, {
      dbName: "b2_" + randomUUID().replaceAll("-", ""),
    });
    await db.init();
    const fixture = openFDAFixture(),
      control = fixture.control;
    let server, base;
    async function start() {
      const app = express();
      app.use(
        "/api/v1",
        createV1({
          db,
          openfda: fixture.adapter,
          rxnorm: createRxNorm({
            spacingMs: 0,
            fetchImpl: async () =>
              Response.json({
                properties: {
                  rxcui: "198440",
                  name: "acetaminophen 500 MG Oral Tablet",
                  tty: "SCD",
                  suppress: "N",
                },
              }),
          }),
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
      a = await register(owner, "B2Owner"),
      b = await register(reader, "B2Reader");
    await register(stranger, "B2Stranger");
    const p = `/patients/${a.patientId}`,
      item = ok(
        await owner.call("POST", p + "/cabinet-items", {
          entryType: "external",
          externalId: "198440",
          reviewed: true,
          strengthText: "500 mg",
          form: "tablet",
        }),
        201,
      ),
      manual = ok(
        await owner.call("POST", p + "/cabinet-items", {
          entryType: "manual",
          displayName: "Synthetic manual",
        }),
        201,
      );
    const path = `${p}/cabinet-items/${item.id}`,
      cardPath = path + "/information-card";
    let candidate, saved, originalSource, selectBody, selectKey, grant;
    await t.test(
      "manual identity is explicitly unavailable; personal note persists independently without upstream",
      async () => {
        const before = control.requests.length,
          mp = `${p}/cabinet-items/${manual.id}`;
        const r = ok(await owner.call("GET", mp + "/label-candidates"));
        assert.equal(r.reason, "unverified_identity");
        assert.equal(control.requests.length, before);
        const note = ok(
          await owner.call("PATCH", mp + "/information-card/note", {
            expectedRevision: null,
            personalNote: "Ask about identity — synthetic note",
          }),
        );
        assert.equal(note.availability, "unavailable");
        assert.equal(note.source, null);
        assert.equal(
          ok(await owner.call("GET", mp + "/information-card")).personalNote,
          note.personalNote,
        );
        assert.equal(
          (
            await owner.call("PUT", mp + "/information-card", {
              expectedRevision: 0,
              expectedCabinetRevision: 0,
              selectedLabelId: fixtureId,
              expectedContentHash: "a".repeat(64),
              applicabilityConfirmed: true,
            })
          ).status,
          422,
        );
      },
    );
    await t.test(
      "candidate lookup is bounded, paginated and never activates a card; wrong candidate/review/forged fields fail",
      async () => {
        const r = await owner.call("GET", path + "/label-candidates");
        candidate = ok(r).candidates[0];
        assert.equal(candidate.rxcui, "198440");
        assert.ok(r.body.meta.nextCursor);
        ok(
          await owner.call(
            "GET",
            path + "/label-candidates?cursor=" + r.body.meta.nextCursor,
          ),
        );
        assert.equal(ok(await owner.call("GET", cardPath)).revision, null);
        selectBody = {
          expectedRevision: null,
          expectedCabinetRevision: item.revision,
          selectedLabelId: candidate.labelId,
          expectedContentHash: candidate.contentHash,
          applicabilityConfirmed: true,
        };
        for (const patch of [
          { selectedLabelId: wrongId },
          { applicabilityConfirmed: false },
          { sourceUrl: "https://forged.test" },
          { selectedLabelId: "https://evil.test" },
        ])
          assert.equal(
            (await owner.call("PUT", cardPath, { ...selectBody, ...patch }))
              .status,
            422,
          );
        assert.equal(
          (
            await owner.call("PUT", cardPath, {
              ...selectBody,
              expectedContentHash: "a".repeat(64),
            })
          ).status,
          409,
        );
        assert.equal(
          await mongoose
            .model("MedicineCard")
            .countDocuments({ cabinetItemId: item.id }),
          0,
        );
      },
    );
    await t.test(
      "source change after review is rejected; selection and concurrent replay persist one immutable exact source",
      async () => {
        control.changed = true;
        assert.equal(
          (await owner.call("PUT", cardPath, selectBody)).body.error.code,
          "SOURCE_CHANGED",
        );
        control.changed = false;
        selectKey = randomUUID();
        const replies = await Promise.all([
          owner.call("PUT", cardPath, selectBody, selectKey),
          owner.call("PUT", cardPath, selectBody, selectKey),
        ]);
        saved = ok(replies[0]);
        ok(replies[1]);
        assert.equal(saved.availability, "available");
        assert.equal(
          await mongoose
            .model("MedicineCard")
            .countDocuments({ cabinetItemId: item.id }),
          1,
        );
        assert.equal(
          await mongoose
            .model("SourceRecord")
            .countDocuments({ provider: "openfda" }),
          1,
        );
        originalSource = await db.one("SourceRecord", { _id: saved.source.id });
        assert.deepEqual(saved.selectedPassages, candidate.passages);
        assert.equal(saved.evidenceRefs[0].sourceRecordId, saved.source.id);
        assert.equal(saved.source.externalId, fixtureId);
        assert.ok(
          Date.parse(saved.source.retrievedAt) >=
            Date.parse(candidate.retrievedAt),
        );
        control.down = true;
        const before = control.requests.length;
        ok(await owner.call("PUT", cardPath, selectBody, selectKey));
        assert.equal(control.requests.length, before);
        control.down = false;
      },
    );
    await t.test(
      "outage is distinct from no-match and saved reads/notes remain available; note cannot rewrite evidence",
      async () => {
        control.down = true;
        assert.equal(
          (await owner.call("GET", path + "/label-candidates?refresh=true"))
            .status,
          503,
        );
        assert.equal(
          ok(await owner.call("GET", cardPath)).source.id,
          saved.source.id,
        );
        saved = ok(
          await owner.call("PATCH", cardPath + "/note", {
            expectedRevision: saved.revision,
            personalNote: "Synthetic note <script>not executable</script>",
          }),
        );
        assert.deepEqual(
          await db.one("SourceRecord", { _id: saved.source.id }),
          originalSource,
        );
        assert.equal(
          await mongoose
            .model("SourceRecord")
            .countDocuments({ provider: "openfda" }),
          1,
        );
        control.down = false;
        assert.equal(
          (
            await owner.call("PATCH", cardPath + "/note", {
              expectedRevision: 0,
              personalNote: "stale",
            })
          ).status,
          409,
        );
        assert.equal(
          (
            await owner.call("PATCH", cardPath + "/note", {
              expectedRevision: saved.revision,
              personalNote: "x".repeat(2001),
            })
          ).status,
          422,
        );
        control.empty = true;
        assert.equal(
          ok(await owner.call("GET", path + "/label-candidates?refresh=true"))
            .reason,
          "no_matching_label",
        );
        control.empty = false;
        assert.equal(
          ok(await owner.call("GET", cardPath)).source.id,
          saved.source.id,
        );
      },
    );
    await t.test(
      "read-only, cross-patient, CSRF and immediate revocation protect source and private note, including replay",
      async () => {
        grant = ok(
          await owner.call("POST", p + "/access-grants", {
            userId: b.user.id,
            permissions: ["cabinet.read", "cabinet.write"],
          }),
          201,
        );
        const replayKey = randomUUID(),
          replayBody = {
            expectedRevision: saved.revision,
            personalNote: saved.personalNote,
          };
        saved = ok(
          await reader.call("PATCH", cardPath + "/note", replayBody, replayKey),
        );
        grant = ok(
          await owner.call("PATCH", `${p}/access-grants/${grant.id}`, {
            expectedRevision: grant.revision,
            permissions: ["cabinet.read"],
          }),
        );
        assert.equal(
          (
            await reader.call(
              "PATCH",
              cardPath + "/note",
              replayBody,
              replayKey,
            )
          ).status,
          403,
        );
        assert.equal(
          ok(await reader.call("GET", cardPath)).personalNote,
          saved.personalNote,
        );
        assert.equal(
          (
            await reader.call("PATCH", cardPath + "/note", {
              expectedRevision: saved.revision,
              personalNote: "No",
            })
          ).status,
          403,
        );
        assert.equal((await stranger.call("GET", cardPath)).status, 404);
        const other = ok(
          await owner.call("POST", "/patients", {
            displayName: "Other B2",
            timezone: "UTC",
          }),
          201,
        );
        assert.equal(
          (
            await owner.call(
              "GET",
              `/patients/${other.id}/cabinet-items/${item.id}/information-card`,
            )
          ).status,
          404,
        );
        const token = owner.csrf;
        owner.csrf = "bad";
        assert.equal(
          (await owner.call("PUT", cardPath, selectBody)).status,
          403,
        );
        owner.csrf = token;
        ok(
          await owner.call("POST", `${p}/access-grants/${grant.id}/revoke`, {
            expectedRevision: grant.revision,
          }),
        );
        assert.equal((await reader.call("GET", cardPath)).status, 404);
        assert.equal(
          (
            await reader.call(
              "PATCH",
              cardPath + "/note",
              replayBody,
              replayKey,
            )
          ).status,
          404,
        );
      },
    );
    await t.test(
      "reselection preserves note and old source snapshot; explicit removal and note clearing do not fabricate evidence",
      async () => {
        control.changed = true;
        const c = ok(
          await owner.call("GET", path + "/label-candidates?refresh=true"),
        ).candidates[0];
        saved = ok(
          await owner.call("PUT", cardPath, {
            ...selectBody,
            expectedRevision: saved.revision,
            expectedContentHash: c.contentHash,
          }),
        );
        assert.equal(saved.source.sourceVersion, "2");
        assert.equal(
          saved.personalNote,
          "Synthetic note <script>not executable</script>",
        );
        assert.deepEqual(
          await db.one("SourceRecord", { _id: originalSource._id }),
          originalSource,
        );
        saved = ok(
          await owner.call("PUT", cardPath, {
            expectedRevision: saved.revision,
            expectedCabinetRevision: item.revision,
            selectedLabelId: null,
          }),
        );
        assert.equal(saved.source, null);
        assert.equal(saved.selectedPassages.length, 0);
        assert.ok(saved.personalNote);
        saved = ok(
          await owner.call("PATCH", cardPath + "/note", {
            expectedRevision: saved.revision,
            personalNote: "",
          }),
        );
        assert.equal(saved.personalNote, "");
        saved = ok(
          await owner.call("PUT", cardPath, {
            ...selectBody,
            expectedRevision: saved.revision,
            expectedContentHash: c.contentHash,
          }),
        );
      },
    );
    await t.test(
      "failed card write rolls back source, audit and operation; no partial snapshot",
      async () => {
        const before = await mongoose
            .model("SourceRecord")
            .countDocuments({ provider: "openfda" }),
          original = db.update;
        db.update = async (name, ...args) => {
          if (name === "MedicineCard") throw Error("Injected B2 failure");
          return original(name, ...args);
        };
        try {
          assert.equal(
            (
              await owner.call("PUT", cardPath, {
                ...selectBody,
                expectedRevision: saved.revision,
                expectedContentHash: saved.source.contentHash,
              })
            ).status,
            503,
          );
        } finally {
          db.update = original;
        }
        assert.equal(
          await mongoose
            .model("SourceRecord")
            .countDocuments({ provider: "openfda" }),
          before,
        );
        assert.equal(
          ok(await owner.call("GET", cardPath)).revision,
          saved.revision,
        );
      },
    );
    await t.test(
      "cabinet edits mark retained evidence stale and reject old revision; restart preserves facts and notes",
      async () => {
        ok(
          await owner.call("PATCH", path, {
            expectedRevision: item.revision,
            strengthText: "500 mg reviewed",
            reason: "Synthetic review",
          }),
        );
        assert.equal(ok(await owner.call("GET", cardPath)).itemChanged, true);
        assert.equal(
          (
            await owner.call("PUT", cardPath, {
              ...selectBody,
              expectedRevision: saved.revision,
              expectedContentHash: saved.source.contentHash,
            })
          ).body.error.code,
          "SOURCE_CHANGED",
        );
        const before = ok(await owner.call("GET", cardPath));
        await new Promise((r) => server.close(r));
        await start();
        assert.deepEqual(ok(await owner.call("GET", cardPath)), before);
      },
    );
    await t.test(
      "missing source record hides uncited passages without erasing the card",
      async () => {
        const original = db.one;
        db.one = async (name, filter, ...args) =>
          name === "SourceRecord" && filter.provider === "openfda"
            ? null
            : original(name, filter, ...args);
        try {
          assert.equal(
            (await owner.call("GET", cardPath)).body.error.code,
            "SOURCE_RECORD_UNAVAILABLE",
          );
        } finally {
          db.one = original;
        }
        assert.equal(
          ok(await owner.call("GET", cardPath)).source.id,
          saved.source.id,
        );
      },
    );
    await t.test(
      "concurrent real cabinet archive conflicts with selection; archived evidence stays read-only",
      async () => {
        const row = ok(await owner.call("GET", path)),
          original = db.fence;
        let archived = false;
        db.fence = async (name, filter, s) => {
          if (name === "CabinetItem" && !archived) {
            archived = true;
            ok(
              await owner.call("POST", path + "/archive", {
                expectedRevision: row.revision,
              }),
            );
          }
          return original(name, filter, s);
        };
        try {
          assert.equal(
            (
              await owner.call("PUT", cardPath, {
                ...selectBody,
                expectedRevision: saved.revision,
                expectedCabinetRevision: row.revision,
                expectedContentHash: saved.source.contentHash,
              })
            ).status,
            409,
          );
        } finally {
          db.fence = original;
        }
        assert.equal(
          ok(await owner.call("GET", cardPath)).source.id,
          saved.source.id,
        );
        assert.equal(
          (
            await owner.call("PATCH", cardPath + "/note", {
              expectedRevision: saved.revision,
              personalNote: "archived",
            })
          ).status,
          409,
        );
      },
    );
  },
);
