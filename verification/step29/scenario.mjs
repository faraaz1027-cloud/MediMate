import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import {
  seedDoseSchedule,
  expectStatus as ok,
  syntheticPassword,
} from "../step27/fixture.mjs";

// Scripted synthetic rehearsal; the team still demonstrates/reviews its own UI.
export async function runModule2Scenario({
  getBase,
  now,
  advanceTo,
  queueDue,
  restart,
  sourceOutage,
  originalLabel,
  mode,
}) {
  const checks = [],
    exchanges = [];
  const client = () => ({
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
      if (b.data?.csrfToken) this.csrf = b.data.csrfToken;
      exchanges.push({ method, path, status: r.status });
      return { status: r.status, body: b };
    },
  });
  async function register(c, email, name) {
    await c.call("GET", "/auth/csrf");
    return ok(
      await c.call("POST", "/auth/register", {
        email,
        password: syntheticPassword,
        displayName: name,
      }),
      201,
    );
  }
  const owner = client(),
    carer = client();
  const a = await register(
    owner,
    "module2-owner@example.test",
    "Synthetic Module 2 owner",
  );
  const b = await register(
    carer,
    "module2-caregiver@example.test",
    "Synthetic Module 2 caregiver",
  );
  const p = "/patients/" + a.patientId;
  const grant = ok(
    await owner.call("POST", p + "/access-grants", {
      userId: b.user.id,
      permissions: [
        "cabinet.read",
        "dose.read",
        "dose.record",
        "task.read",
        "task.write",
      ],
    }),
    201,
  );
  const item = ok(
    await owner.call("POST", p + "/cabinet-items", {
      entryType: "external",
      externalId: "198440",
      reviewed: true,
      strengthText: "500 mg",
      form: "tablet",
    }),
    201,
  );
  const seed = await seedDoseSchedule(owner, p, now(), item.displayName, item);
  assert.equal(seed.version.sourceSnapshot.cabinetItemId, item.id);
  assert.equal(seed.occurrences.length, 12);
  checks.push(
    "A1/B1/A2 share the same saved medicine and patient; preview/confirmation persists 12 occurrences",
  );
  const itemPath = p + "/cabinet-items/" + item.id;
  const candidate = ok(await owner.call("GET", itemPath + "/label-candidates"))
    .candidates[0];
  assert.ok(candidate);
  let card = ok(
    await owner.call("PUT", itemPath + "/information-card", {
      expectedRevision: null,
      expectedCabinetRevision: item.revision,
      selectedLabelId: candidate.labelId,
      expectedContentHash: candidate.contentHash,
      applicabilityConfirmed: true,
    }),
  );
  const passages = card.selectedPassages;
  const original = originalLabel(card.source.externalId);
  assert.ok(original);
  for (const passage of passages)
    assert.equal(passage.text, original[passage.key][passage.index]);
  assert.equal(
    card.source.contentHash,
    createHash("sha256").update(JSON.stringify(original)).digest("hex"),
  );
  assert.equal(card.source.provider, "openfda");
  checks.push(
    "B2 chosen exact product label passages equal original response fields and retain source link/time",
  );
  sourceOutage(true);
  assert.equal(
    (await owner.call("GET", itemPath + "/label-candidates?refresh=true"))
      .status,
    503,
  );
  card = ok(
    await owner.call("PATCH", itemPath + "/information-card/note", {
      expectedRevision: card.revision,
      personalNote:
        "Synthetic review question; personal note separate from source facts.",
    }),
  );
  assert.deepEqual(card.selectedPassages, passages);
  sourceOutage(false);
  checks.push(
    "Deliberately injected source outage preserves B2 passages and permits independent note persistence",
  );
  advanceTo(new Date(seed.start.getTime() + 25 * 60000));
  ok(
    await owner.call("PUT", p + "/dose-reminder-settings", {
      expectedRevision: null,
      enabled: true,
      consent: true,
    }),
  );
  assert.equal(await queueDue(), 3);
  const [first, second, third] = seed.occurrences;
  const action = (c, dose, kind, body, key = randomUUID()) =>
    c.call(
      "POST",
      `${p}/doses/${dose.id}/${kind}`,
      { ...body, clientRequestId: key },
      key,
    );
  const key = randomUUID();
  const taken = await Promise.all(
    [1, 2].map(() =>
      action(
        owner,
        first,
        "actions",
        { expectedRevision: 0, action: "taken" },
        key,
      ),
    ),
  );
  for (const r of taken) ok(r);
  assert.equal(taken[0].body.data.actionId, taken[1].body.data.actionId);
  ok(
    await action(carer, second, "actions", {
      expectedRevision: 0,
      action: "skipped",
    }),
  );
  const snoozed = ok(
    await action(owner, third, "snoozes", { expectedRevision: 0, minutes: 10 }),
  ).dose;
  assert.equal(snoozed.dueAtUTC, third.dueAtUTC);
  assert.equal(snoozed.state, "pending");
  assert.equal(
    snoozed.reminderDueAtUTC,
    new Date(now().getTime() + 10 * 60000).toISOString(),
  );
  const detail = ok(await owner.call("GET", `${p}/doses/${first.id}`));
  assert.equal(detail.actions.length, 1);
  assert.equal(detail.reminders[0].status, "disabled");
  assert.equal(detail.reminders[0].attemptCount, 0);
  const skipped = ok(await owner.call("GET", `${p}/doses/${second.id}`));
  assert.equal(skipped.actions[0].actorUserId, b.user.id);
  checks.push(
    "C2 taken replay produces one action, caregiver skip retains actor, and snooze changes reminder only",
  );
  const list = await owner.call("GET", p + "/doses");
  ok(list);
  assert.equal(list.body.meta.summary.taken, 1);
  assert.equal(list.body.meta.summary.skipped, 1);
  assert.equal(list.body.meta.summary.pending, 10);
  checks.push(
    "Whole-day counts reconcile to 1 taken / 1 skipped / 10 pending, with disabled notices and no false receipt",
  );
  let task = ok(
    await owner.call("POST", p + "/tasks", {
      title: "Synthetic Module 2 handover",
      assigneeUserId: b.user.id,
      type: "general",
      description: "Review the shared synthetic medication checklist.",
    }),
    201,
  );
  task = ok(
    await carer.call("POST", `${p}/tasks/${task.id}/acknowledgements`, {
      expectedRevision: task.revision,
    }),
  );
  task = ok(
    await carer.call("POST", `${p}/tasks/${task.id}/transitions`, {
      expectedRevision: task.revision,
      action: "accept",
    }),
  );
  task = ok(
    await carer.call("POST", `${p}/tasks/${task.id}/transitions`, {
      expectedRevision: task.revision,
      action: "complete",
    }),
  );
  assert.equal(task.status, "completed");
  checks.push(
    "Module 1 C1 acknowledgement and caregiver transitions still work on the Module 2 patient",
  );
  await restart();
  const retained = ok(await owner.call("GET", itemPath + "/information-card"));
  assert.equal(retained.personalNote, card.personalNote);
  assert.deepEqual(retained.selectedPassages, passages);
  assert.equal(
    ok(await owner.call("GET", `${p}/doses/${first.id}`)).actions.length,
    1,
  );
  assert.equal(
    ok(await carer.call("GET", `${p}/tasks/${task.id}`)).status,
    "completed",
  );
  checks.push(
    "Server recreation preserves A2/C2/B2/C1 references, history, source facts and private note",
  );
  ok(
    await owner.call("POST", `${p}/access-grants/${grant.id}/revoke`, {
      expectedRevision: grant.revision,
    }),
  );
  assert.equal((await carer.call("GET", p + "/doses")).status, 404);
  assert.equal(
    (
      await action(carer, third, "actions", {
        expectedRevision: 1,
        action: "taken",
      })
    ).status,
    404,
  );
  checks.push(
    "Revoked caregiver loses dose reads/actions immediately across the integrated workflow",
  );
  return {
    runAt: new Date().toISOString(),
    mode,
    synthetic: true,
    controlledClock: now().toISOString(),
    checks,
    exchanges,
    records: {
      patientId: a.patientId,
      cabinetItemId: item.id,
      scheduleId: seed.schedule.id,
      doseIds: seed.occurrences.map((d) => d.id),
      cardId: card.id,
      taskId: task.id,
    },
    source: {
      labelId: card.source.externalId,
      url: card.source.sourceUrl,
      retrievedAt: card.source.retrievedAt,
      passageCount: passages.length,
      contentHash: card.source.contentHash,
      originalResponseFields: Object.fromEntries(
        [
          "id",
          "set_id",
          "version",
          "effective_time",
          "openfda",
          ...new Set(passages.map((p) => p.key)),
        ]
          .filter((k) => original[k] !== undefined)
          .map((k) => [k, original[k]]),
      ),
      savedPassages: passages,
    },
    expected: {
      doses: 12,
      doseActions: 3,
      taken: 1,
      skipped: 1,
      pending: 10,
      disabledReminderJobs: 3,
      notificationAttempts: 0,
    },
    openGates: [
      "Public deployment and cloud MongoDB not configured",
      "Faculty online/local decision unconfirmed",
      "Real Telegram send/receipt unavailable",
      "Individual contribution/Jira/viva/faculty acceptance",
    ],
  };
}
