import assert from "node:assert/strict";
export const syntheticPassword = "Synthetic-pass-123!";
export function expectStatus(r, status = 200) {
  assert.equal(r.status, status, JSON.stringify(r.body));
  return r.body.data;
}
// Seed through actual A1/B1/A2 HTTP routes, not fabricated dose documents.
export async function seedDoseSchedule(
  client,
  patientPath,
  at,
  label = "Synthetic C2 medicine",
  existingCabinet = null,
) {
  const cabinet =
    existingCabinet ||
    expectStatus(
      await client.call("POST", patientPath + "/cabinet-items", {
        entryType: "manual",
        displayName: label,
        strengthText: "500 mg",
        form: "tablet",
      }),
      201,
    );
  const draft = expectStatus(
    await client.call("POST", patientPath + "/prescriptions", {
      title: label + " source",
      instructions: [
        {
          lineNumber: 1,
          cabinetItemId: cabinet.id,
          medicineText: label,
          strengthText: "500 mg",
          instructionsText: "Synthetic test only; not medical directions",
          doseQuantity: "1",
          doseUnit: "tablet",
          frequencyText: "Synthetic ten-minute test interval",
          durationText: "Synthetic two-hour test course",
          clarificationRequired: false,
        },
      ],
    }),
    201,
  );
  const confirmed = expectStatus(
    await client.call(
      "POST",
      `${patientPath}/prescriptions/${draft.prescription.id}/versions/${draft.draftVersion.id}/confirm`,
      { expectedRevision: 0, reviewed: true },
    ),
  );
  const start = new Date(at.getTime() + 60000),
    end = new Date(start.getTime() + 120 * 60000),
    preview = expectStatus(
      await client.call("POST", patientPath + "/schedule-previews", {
        prescriptionInstructionId: confirmed.currentVersion.instructions[0].id,
        cabinetItemId: cabinet.id,
        timingMode: "interval",
        timezone: "Asia/Dhaka",
        doseQuantity: "1",
        doseUnit: "tablet",
        effectiveFromUTC: start.toISOString(),
        endAtUTC: end.toISOString(),
        intervalMinutes: 10,
        anchorAtUTC: start.toISOString(),
        reviewedAgainstSource: true,
      }),
    ),
    saved = expectStatus(
      await client.call("POST", patientPath + "/schedules", {
        previewToken: preview.previewToken,
        confirmed: true,
      }),
      201,
    ),
    occurrences = expectStatus(
      await client.call(
        "GET",
        `${patientPath}/schedules/${saved.schedule.id}/occurrences?view=history&limit=100`,
      ),
    );
  return {
    cabinet,
    prescription: confirmed.prescription,
    schedule: saved.schedule,
    version: saved.version,
    occurrences,
    start,
    end,
  };
}
