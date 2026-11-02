import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

// Real HTTP and persisted records. The caller declares/instruments its upstream;
// this function never logs or returns session cookies, passwords or CSRF values.
export async function runModule1Scenario({ getBase, restart, upstreamMode }) {
  const checks = [];
  function client() {
    return {
      cookie: "",
      csrf: "",
      async call(method, path, body, key = randomUUID()) {
        const r = await fetch(getBase() + path, {
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
  async function ok(c, method, path, body, status = 200, key) {
    const r = await c.call(method, path, body, key);
    assert.equal(
      r.status,
      status,
      `${method} ${path}: ${JSON.stringify(r.body.error || {})}`,
    );
    return r.body.data;
  }
  async function register(c, role) {
    await ok(c, "GET", "/auth/csrf");
    return ok(
      c,
      "POST",
      "/auth/register",
      {
        email: `module1-${role}-${randomUUID()}@example.test`,
        password: "Synthetic-module1-pass-123!",
        displayName: `Module 1 synthetic ${role}`,
      },
      201,
    );
  }
  const owner = client(),
    carer = client(),
    outsider = client(),
    a = await register(owner, "organizer"),
    c = await register(carer, "caregiver"),
    o = await register(outsider, "outsider");
  const patient = `/patients/${a.patientId}`,
    pRoute = patient + "/prescriptions",
    bRoute = patient + "/cabinet-items",
    tRoute = patient + "/tasks";
  const permissions = [
    "prescription.read",
    "prescription.write",
    "prescription.confirm",
    "cabinet.read",
    "cabinet.write",
    "task.read",
    "task.write",
  ];
  let grant = await ok(
    owner,
    "POST",
    patient + "/access-grants",
    { userId: c.user.id, permissions },
    201,
  );
  async function setPermissions(values) {
    grant = await ok(owner, "PATCH", patient + `/access-grants/${grant.id}`, {
      expectedRevision: grant.revision,
      permissions: values,
    });
  }
  const search = await ok(
    owner,
    "GET",
    patient + "/medicine-search?q=cymbalta",
  );
  assert.ok(search.candidates.some((x) => x.externalId === "596928"));
  assert.ok(search.candidates.length > 1);
  const chosen = await ok(owner, "GET", patient + "/medicine-search/596928");
  let external = await ok(
    owner,
    "POST",
    bRoute,
    {
      entryType: "external",
      externalId: chosen.externalId,
      reviewed: true,
      strengthText: "20 MG",
      form: "Delayed Release Oral Capsule",
    },
    201,
  );
  const unavailable = await owner.call(
    "GET",
    patient + "/medicine-search?q=module1-deliberate-outage",
  );
  assert.equal(unavailable.status, 503);
  assert.equal(unavailable.body.error.code, "RXNORM_UNAVAILABLE");
  const manual = await ok(
    owner,
    "POST",
    bRoute,
    {
      entryType: "manual",
      displayName: "Demo medicine",
      strengthText: "Synthetic strength",
      form: "tablet",
    },
    201,
  );
  const foreign = await ok(
    outsider,
    "POST",
    `/patients/${o.patientId}/cabinet-items`,
    { entryType: "manual", displayName: "Other patient's synthetic item" },
    201,
  );
  checks.push(
    "B1 explicit external selection, controlled outage and labelled manual fallback persisted for one patient",
  );
  const complete = {
    lineNumber: 1,
    medicineText: chosen.displayName,
    instructionsText: "Synthetic transcription for software testing only",
    doseQuantity: "1",
    doseUnit: "capsule",
    frequencyText: "Synthetic morning",
    durationText: "Synthetic seven days",
    clarificationRequired: false,
    cabinetItemId: external.id,
  };
  let p1 = await ok(
    owner,
    "POST",
    pRoute,
    {
      title: "Module 1 manual review",
      instructions: [
        {
          lineNumber: 1,
          medicineText: complete.medicineText,
          instructionsText: complete.instructionsText,
          clarificationRequired: true,
          cabinetItemId: external.id,
        },
      ],
    },
    201,
  );
  assert.equal(
    (
      await owner.call(
        "POST",
        `${pRoute}/${p1.prescription.id}/versions/${p1.draftVersion.id}/confirm`,
        { expectedRevision: 0, reviewed: true },
      )
    ).status,
    422,
  );
  await ok(
    owner,
    "PATCH",
    `${pRoute}/${p1.prescription.id}/versions/${p1.draftVersion.id}`,
    {
      expectedRevision: 0,
      instructions: [complete],
      reviewCorrections: "Synthetic fields reviewed",
    },
  );
  const confirmed = await ok(
    owner,
    "POST",
    `${pRoute}/${p1.prescription.id}/versions/${p1.draftVersion.id}/confirm`,
    { expectedRevision: 1, reviewed: true },
  );
  const v1 = confirmed.currentVersion;
  assert.equal(v1.instructions[0].cabinetItemId, external.id);
  assert.equal(v1.instructions[0].patientId, a.patientId);
  checks.push(
    "A1 manual draft completeness/review gate and A1–B1 persisted same-patient reference",
  );
  // Only a source-metadata contract fixture here. Real OCR must be exercised in
  // the browser and reported separately; this does not pretend to run an engine.
  const ocrLine = {
    ...complete,
    medicineText: "Demo medicine",
    cabinetItemId: manual.id,
    doseUnit: "tablet",
  };
  const p2 = await ok(
    owner,
    "POST",
    pRoute,
    {
      title: "Module 1 OCR metadata contract fixture",
      source: {
        fileName: "synthetic-api-source.png",
        mimeType: "image/png",
        sizeBytes: 100,
        sha256: "a".repeat(64),
        ocrText: "Synthetic API metadata fixture; not engine output",
        ocrStatus: "succeeded",
      },
      instructions: [ocrLine],
    },
    201,
  );
  await setPermissions(["prescription.read", "prescription.confirm"]);
  const careConfirmKey = randomUUID();
  const c2 = await ok(
    carer,
    "POST",
    `${pRoute}/${p2.prescription.id}/versions/${p2.draftVersion.id}/confirm`,
    { expectedRevision: 0, reviewed: true },
    200,
    careConfirmKey,
  );
  assert.equal(c2.currentVersion.confirmedByUserId, c.user.id);
  await setPermissions(permissions);
  checks.push(
    "Saved source-metadata fixture remains untrusted; independent confirmer needs no cabinet.read",
  );
  const before = (await ok(owner, "GET", pRoute)).length;
  for (const bad of [foreign.id, "f".repeat(24), "invalid"]) {
    const r = await owner.call("POST", pRoute, {
      title: "Invalid cross-record reference",
      instructions: [{ ...complete, cabinetItemId: bad }],
    });
    assert.equal(r.status, 422);
    assert.equal(r.body.error.fields[0].path, "instructions.0.cabinetItemId");
  }
  assert.equal((await ok(owner, "GET", pRoute)).length, before);
  assert.equal(
    (
      await carer.call(
        "GET",
        `/patients/${o.patientId}/prescriptions/${p1.prescription.id}`,
      )
    ).status,
    404,
  );
  checks.push(
    "Missing/cross-patient cabinet references rejected without partial prescription writes",
  );
  await setPermissions([
    "prescription.read",
    "prescription.write",
    "prescription.confirm",
  ]);
  const replacement = await ok(
    carer,
    "POST",
    `${pRoute}/${p1.prescription.id}/versions`,
    {
      expectedRevision: confirmed.prescription.revision,
      previousVersionId: v1.id,
      instructions: [complete],
    },
    201,
  );
  const path = `${pRoute}/${p1.prescription.id}/versions/${replacement.draftVersion.id}`;
  assert.equal(
    (
      await carer.call("PATCH", path, {
        expectedRevision: 0,
        instructions: [{ ...complete, cabinetItemId: manual.id }],
      })
    ).status,
    403,
  );
  assert.equal(
    (await ok(owner, "GET", `${pRoute}/${p1.prescription.id}`)).draftVersion
      .instructions[0].cabinetItemId,
    external.id,
  );
  await ok(carer, "PATCH", path, {
    expectedRevision: 0,
    instructions: [{ ...complete, doseQuantity: "2" }],
  });
  const c3 = await ok(carer, "POST", path + "/confirm", {
    expectedRevision: 1,
    reviewed: true,
  });
  await setPermissions(permissions);
  checks.push(
    "New associations require cabinet.read; retained references and confirmation preserve independent permissions",
  );
  let task = await ok(
    owner,
    "POST",
    tRoute,
    {
      title: "Module 1 synthetic caregiver handover",
      type: "general",
      assigneeUserId: c.user.id,
      description: `Review synthetic prescription ${p1.prescription.id}; cabinet reference ${external.id}.`,
      handoverNote: "Synthetic Module 1 checklist only",
    },
    201,
  );
  assert.equal(task.patientId, a.patientId);
  assert.equal(task.assigneeUserId, c.user.id);
  const noteKey = randomUUID(),
    noteBody = {
      text: "Synthetic caregiver reviewed the shared patient checklist",
    };
  await ok(carer, "POST", `${tRoute}/${task.id}/notes`, noteBody, 201, noteKey);
  await ok(carer, "POST", `${tRoute}/${task.id}/notes`, noteBody, 200, noteKey);
  task = await ok(carer, "POST", `${tRoute}/${task.id}/acknowledgements`, {
    expectedRevision: 0,
  });
  task = await ok(carer, "POST", `${tRoute}/${task.id}/transitions`, {
    expectedRevision: task.revision,
    action: "accept",
  });
  task = await ok(carer, "POST", `${tRoute}/${task.id}/transitions`, {
    expectedRevision: task.revision,
    action: "complete",
  });
  task = await ok(owner, "POST", `${tRoute}/${task.id}/transitions`, {
    expectedRevision: task.revision,
    action: "reopen",
  });
  assert.equal(task.acknowledgedAt, null);
  assert.equal(
    (await ok(owner, "GET", `${tRoute}/${task.id}/history`)).filter(
      (e) => e.eventType === "note",
    ).length,
    1,
  );
  const jobs = await ok(owner, "GET", `${tRoute}/${task.id}/notifications`);
  assert.ok(jobs.every((j) => j.status === "disabled" && j.attemptCount === 0));
  checks.push(
    "C1 uses the same patient/caregiver IDs; acknowledgement, transitions and handover persist without false Telegram success",
  );
  grant = await ok(
    owner,
    "POST",
    patient + `/access-grants/${grant.id}/revoke`,
    { expectedRevision: grant.revision },
  );
  for (const resource of [
    pRoute,
    `${pRoute}/${p1.prescription.id}`,
    bRoute,
    `${bRoute}/${external.id}`,
    tRoute,
    `${tRoute}/${task.id}/history`,
  ])
    assert.equal((await carer.call("GET", resource)).status, 404);
  assert.equal(
    (await carer.call("POST", `${tRoute}/${task.id}/notes`, noteBody, noteKey))
      .status,
    404,
  );
  assert.equal(
    (
      await carer.call(
        "POST",
        `${pRoute}/${p2.prescription.id}/versions/${p2.draftVersion.id}/confirm`,
        { expectedRevision: 0, reviewed: true },
        careConfirmKey,
      )
    ).status,
    404,
  );
  await setPermissions(permissions);
  checks.push(
    "Grant revocation blocks all three features and previously successful mutation replay; restore uses the existing grant",
  );
  external = await ok(owner, "PATCH", `${bRoute}/${external.id}`, {
    expectedRevision: external.revision,
    form: "Delayed release oral capsule",
    reason: "Synthetic casing correction",
  });
  external = await ok(owner, "POST", `${bRoute}/${external.id}/archive`, {
    expectedRevision: external.revision,
  });
  const history = await ok(
    owner,
    "GET",
    `${pRoute}/${p1.prescription.id}/versions`,
  );
  assert.equal(
    history.find((v) => v.id === v1.id).instructions[0].cabinetItemId,
    external.id,
  );
  assert.equal(
    history.find((v) => v.id === v1.id).instructions[0].doseQuantity,
    "1",
  );
  const oldDetail = await ok(owner, "GET", `${pRoute}/${p1.prescription.id}`);
  const r3 = await ok(
    owner,
    "POST",
    `${pRoute}/${p1.prescription.id}/versions`,
    {
      expectedRevision: oldDetail.prescription.revision,
      previousVersionId: c3.currentVersion.id,
      instructions: oldDetail.currentVersion.instructions.map(
        ({
          lineNumber,
          medicineText,
          instructionsText,
          doseQuantity,
          doseUnit,
          frequencyText,
          durationText,
          clarificationRequired,
          cabinetItemId,
        }) => ({
          lineNumber,
          medicineText,
          instructionsText,
          doseQuantity,
          doseUnit,
          frequencyText,
          durationText,
          clarificationRequired,
          cabinetItemId,
        }),
      ),
    },
    201,
  );
  const r3path = `${pRoute}/${p1.prescription.id}/versions/${r3.draftVersion.id}`;
  assert.equal(
    (
      await owner.call("POST", r3path + "/confirm", {
        expectedRevision: 0,
        reviewed: true,
      })
    ).status,
    422,
  );
  const revised = {
    ...ocrLine,
    doseQuantity: "2",
    instructionsText: "Synthetic replacement entry, manually reviewed",
  };
  await ok(owner, "PATCH", r3path, {
    expectedRevision: 0,
    instructions: [revised],
  });
  const latest = await ok(owner, "POST", r3path + "/confirm", {
    expectedRevision: 1,
    reviewed: true,
  });
  const diff = await ok(
    owner,
    "GET",
    `${pRoute}/${p1.prescription.id}/comparison?fromVersionId=${c3.currentVersion.id}&toVersionId=${latest.currentVersion.id}`,
  );
  assert.ok(
    diff.changed[0].fields.some(
      (f) =>
        f.field === "cabinetItemId" &&
        f.before === external.id &&
        f.after === manual.id,
    ),
  );
  assert.equal(
    (
      await owner.call("POST", pRoute, {
        title: "Archived new association blocked",
        instructions: [complete],
      })
    ).status,
    422,
  );
  assert.equal(
    (await ok(owner, "GET", `${bRoute}/${external.id}/revisions`)).length,
    3,
  );
  checks.push(
    "Cabinet edits/archive preserve confirmed instruction text/IDs; replacement drafts retain historical references but require active/cleared links to confirm",
  );
  await restart?.();
  const readback = await ok(owner, "GET", `${pRoute}/${p1.prescription.id}`),
    cabinet = await ok(owner, "GET", `${bRoute}/${external.id}`),
    taskRead = await ok(carer, "GET", `${tRoute}/${task.id}`);
  assert.equal(readback.currentVersion.id, latest.currentVersion.id);
  assert.equal(
    readback.currentVersion.instructions[0].cabinetItemId,
    manual.id,
  );
  assert.equal(cabinet.status, "archived");
  assert.equal(cabinet.source.externalId, chosen.externalId);
  assert.equal(taskRead.status, "open");
  assert.equal(taskRead.assignmentGeneration, 1);
  checks.push(
    "API restart/readback retains shared IDs, confirmed history, source/archive state and caregiver task state",
  );
  return {
    step: 24,
    runAt: new Date().toISOString(),
    upstreamMode,
    checks,
    records: {
      patientId: a.patientId,
      organizerUserId: a.user.id,
      caregiverUserId: c.user.id,
      prescriptionIds: [p1.prescription.id, p2.prescription.id],
      currentVersionIds: [latest.currentVersion.id, c2.currentVersion.id],
      originalVersionId: v1.id,
      cabinetItemIds: [external.id, manual.id],
      taskId: task.id,
    },
    ocr: "This API scenario exercises a labelled source-metadata fixture, not an OCR engine; browser OCR evidence is separate.",
    openGates: [
      "Real Telegram bot/consenting recipient and actual receipt evidence",
      "Individual contribution/review/viva and Jira/faculty acceptance",
    ],
    secretsIncluded: false,
  };
}
