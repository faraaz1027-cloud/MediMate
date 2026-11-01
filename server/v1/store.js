import mongoose from "mongoose";
const { Schema } = mongoose;
const oid = Schema.Types.ObjectId;
const models = {};
const collections = {
  User: "users",
  Patient: "patients",
  AccessGrant: "accessGrants",
  Session: "sessions",
  Prescription: "prescriptions",
  PrescriptionVersion: "prescriptionVersions",
  PrescriptionInstruction: "prescriptionInstructions",
  CabinetItem: "cabinetItems",
  Task: "careTasks",
  TaskEvent: "taskEvents",
  Operation: "operations",
  AuditEvent: "auditEvents",
};
function model(name, fields, indexes = []) {
  const schema = new Schema(
    {
      ...fields,
      schemaVersion: { type: Number, default: 1, immutable: true },
      revision: { type: Number, default: 0 },
    },
    { timestamps: true, strict: "throw", collection: collections[name] },
  );
  for (const [key, options] of indexes) schema.index(key, options);
  models[name] = mongoose.models[name] || mongoose.model(name, schema);
}
model(
  "User",
  {
    emailNormalized: { type: String, required: true },
    displayName: String,
    passwordHash: String,
  },
  [[{ emailNormalized: 1 }, { unique: true }]],
);
model("Patient", {
  ownerUserId: oid,
  displayName: String,
  timezone: String,
  status: String,
});
model(
  "AccessGrant",
  { patientId: oid, userId: oid, permissions: [String], revokedAt: Date },
  [[{ patientId: 1, userId: 1 }, { unique: true }]],
);
model(
  "Session",
  { tokenHash: String, csrfToken: String, userId: oid, expiresAt: Date },
  [
    [{ tokenHash: 1 }, { unique: true }],
    [{ expiresAt: 1 }, { expireAfterSeconds: 0 }],
  ],
);
model("Prescription", {
  patientId: oid,
  title: String,
  status: String,
  currentVersionId: oid,
  draftVersionId: oid,
});
model(
  "PrescriptionVersion",
  {
    patientId: oid,
    prescriptionId: oid,
    versionNumber: Number,
    status: String,
    previousVersionId: oid,
    confirmedAt: Date,
    confirmedByUserId: oid,
    reviewCorrections: String,
    source: Schema.Types.Mixed,
  },
  [[{ prescriptionId: 1, versionNumber: 1 }, { unique: true }]],
);
model("PrescriptionInstruction", {
  patientId: oid,
  prescriptionVersionId: oid,
  lineNumber: Number,
  medicineText: String,
  instructionsText: String,
  strengthText: String,
  doseQuantity: Schema.Types.Decimal128,
  doseUnit: String,
  frequencyText: String,
  durationText: String,
  clarificationRequired: Boolean,
});
model("CabinetItem", {
  patientId: oid,
  displayName: String,
  entryType: String,
  status: String,
  strengthText: String,
  form: String,
});
model("Task", {
  patientId: oid,
  createdByUserId: oid,
  assigneeUserId: oid,
  title: String,
  description: String,
  type: String,
  status: String,
  dueAtUTC: Date,
});
model("TaskEvent", {
  patientId: oid,
  taskId: oid,
  actorUserId: oid,
  eventType: String,
  text: String,
});
model(
  "Operation",
  {
    patientId: oid,
    actorUserId: oid,
    key: String,
    route: String,
    requestHash: String,
    status: Number,
    response: Schema.Types.Mixed,
  },
  [[{ patientId: 1, actorUserId: 1, key: 1, route: 1 }, { unique: true }]],
);
model("AuditEvent", {
  patientId: oid,
  actorUserId: oid,
  entityId: oid,
  action: String,
  requestId: String,
});
for (const name of ["Prescription", "CabinetItem", "Task"])
  models[name].schema.index({ patientId: 1, createdAt: -1, _id: -1 });
models.PrescriptionInstruction.schema.index(
  { prescriptionVersionId: 1, lineNumber: 1 },
  { unique: true },
);
models.Operation.schema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 30 * 24 * 3600 },
);
export const db = {
  async init() {
    await Promise.all(Object.values(models).map((m) => m.init()));
  },
  async one(name, filter, session) {
    return models[name]
      .findOne(filter)
      .session(session || null)
      .lean();
  },
  async insert(name, doc, session) {
    const [r] = await models[name].create([doc], { session });
    return r.toObject();
  },
  async list(name, filter, limit, session) {
    return models[name]
      .find(filter)
      .session(session || null)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .lean();
  },
  async update(name, filter, set, session) {
    return models[name]
      .findOneAndUpdate(
        filter,
        { $set: set, $inc: { revision: 1 } },
        { new: true, session },
      )
      .lean();
  },
  async remove(name, filter, session) {
    await models[name].deleteMany(filter).session(session || null);
  },
  async transaction(fn) {
    return mongoose.connection.transaction(fn);
  },
};
