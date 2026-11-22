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
  CabinetRevision: "cabinetRevisions",
  SourceRecord: "sourceRecords",
  IngredientConfirmation: "ingredientConfirmations",
  IngredientReview: "ingredientReviews",
  EducationalAnswer: "educationalAnswers",
  FollowupSettings: "followupSettings",
  DoseFollowup: "doseFollowups",
  HealthNote: "healthNotes",
  HealthNoteRevision: "healthNoteRevisions",
  ReportExport: "reportExports",
  EmergencyContact: "emergencyContacts",
  SosIncident: "sosIncidents",
  SosJob: "sosJobs",
  SosAttempt: "sosAttempts",
  SosAcknowledgement: "sosAcknowledgements",
  SosEvent: "sosEvents",
  SosProviderRequest: "sosProviderRequests",
  Task: "careTasks",
  TaskEvent: "taskEvents",
    TaskNote: "taskNotes",
  ChannelLink: "channelLinks",
  ChannelChallenge: "channelChallenges",
  TelegramReceipt: "telegramReceipts",
  WorkerState: "workerState",
  NotificationJob: "notificationJobs",
  NotificationAttempt: "notificationAttempts",
  Acknowledgement: "acknowledgements",
  Operation: "operations",
  AuditEvent: "auditEvents",
  Schedule: "schedules",
  ScheduleVersion: "scheduleVersions",
  SchedulePreview: "schedulePreviews",
  DoseOccurrence: "doseOccurrences",
  MedicineCard: "medicineCards",
  DoseAction: "doseActions",
  DoseReminderSettings: "doseReminderSettings",
  DoseReminderJob: "doseReminderJobs",
  DoseReminderAttempt: "doseReminderAttempts",
  InventorySettings: "inventorySettings",
  StockTransaction: "stockTransactions",
  RefillList: "refillLists",
  PharmacyPreference: "pharmacyPreferences",
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
model("EducationalAnswer", {
  patientId: oid, cabinetItemId: oid, cabinetRevision: Number, medicineName: String,
  question: String, outcome: String, reason: String, citations: [Schema.Types.Mixed],
  createdBy: oid, rating: String, comment: String, deletedAt: Date,
});
model("FollowupSettings", {scheduleFence:{type:Number,select:false},patientId:oid,ownerUserId:oid,caregiverUserId:oid,enabled:Boolean,delayMinutes:Number}, [[{patientId:1},{unique:true}]]);
model("HealthNote", {patientId:oid,text:String,recordedAt:Date,authorUserId:oid,editedAt:Date}, [[{patientId:1,recordedAt:-1,_id:-1},{}]]);
model("HealthNoteRevision", {patientId:oid,noteId:oid,revisionNumber:Number,text:String,reason:String,actorUserId:oid,recordedAt:Date}, [[{noteId:1,revisionNumber:1},{unique:true}]]);
model("ReportExport", {patientId:oid,createdBy:oid,status:String,snapshot:Schema.Types.Mixed,pdfBytes:Buffer,generatedAt:Date,expiresAt:Date}, [[{patientId:1,_id:-1},{}]]);
model("EmergencyContact", {scheduleFence:{type:Number,select:false},patientId:oid,recipientUserId:oid,displayName:String,contactPhone:String,status:String,consentVersion:Number,invitedAt:Date,expiresAt:Date,consentedAt:Date,revokedAt:Date}, [[{patientId:1,recipientUserId:1},{unique:true}]]);
model("SosIncident", {scheduleFence:{type:Number,select:false},patientId:oid,activatedBy:oid,status:String,activatedAt:Date,closedAt:Date,closedBy:oid,locationStatus:String,location:Schema.Types.Mixed,callbackPhone:String,reason:String,outcome:String}, [[{patientId:1},{unique:true,partialFilterExpression:{status:"active"}}]]);
model("SosJob", {patientId:oid,incidentId:oid,contactId:oid,recipientId:oid,contactConsentVersion:Number,kind:String,channelLinkId:oid,channelRevision:Number,status:String,errorCode:String,attemptCount:Number,runAtUTC:Date,leaseUntil:Date,expiresAt:Date}, [[{incidentId:1,contactId:1,kind:1},{unique:true}]]);
model("SosAttempt", {patientId:oid,jobId:oid,attemptNumber:Number,attemptedAt:Date,status:String,errorCode:String,externalMessageId:String}, [[{jobId:1,attemptNumber:1},{unique:true}]]);
model("SosAcknowledgement", {incidentId:oid,contactId:oid,recipientId:oid,acknowledgedAt:Date}, [[{incidentId:1,contactId:1},{unique:true}]]);
model("SosEvent", {patientId:oid,incidentId:oid,actorUserId:oid,type:String,occurredAt:Date,detail:String});
model("SosProviderRequest", {patientId:oid,incidentId:oid,providerKey:String,providerMode:String,status:String,requestedAt:Date,requestedBy:oid}, [[{incidentId:1,providerKey:1},{unique:true}]]);
model("DoseFollowup", {patientId:oid,occurrenceId:oid,caregiverUserId:oid,taskId:oid,status:String,dueAtUTC:Date,overdueAt:Date,acknowledgedAt:Date,acknowledgedBy:oid,resolvedAt:Date,resolvedBy:oid,outcome:String,note:String}, [[{occurrenceId:1},{unique:true}], [{patientId:1,status:1,_id:-1},{}]]);
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
  scheduleFence: {type:Number,select:false},
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
  scheduleFence: { type: Number, select: false },
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
  cabinetItemId: oid,
  instructionsText: String,
  strengthText: String,
  doseQuantity: Schema.Types.Decimal128,
  doseUnit: String,
  frequencyText: String,
  durationText: String,
  clarificationRequired: Boolean,
});
model("CabinetItem", {
  scheduleFence: { type: Number, select: false },
  patientId: oid,
  displayName: String,
  usageStatus: String,
  entryType: String,
  status: String,
  strengthText: String,
  form: String,
  sourceRecordId: oid,
});
model("SourceRecord", {
  sourceVersion: String,
  provider: String,
  externalId: String,
  sourceUrl: String,
  retrievedAt: Date,
  contentHash: String,
  snapshot: Schema.Types.Mixed,
  matchStatus: String,
});
model("MedicineCard", {
  patientId: oid, cabinetItemId: oid, sourceRecordId: oid,
  availability: String, reason: String, selectedPassages: [Schema.Types.Mixed],
  personalNote: String, itemSnapshot: Schema.Types.Mixed,
  applicabilityConfirmedBy: oid, applicabilityConfirmedAt: Date, revisedAt: Date,
}, [[{ patientId: 1, cabinetItemId: 1 }, { unique: true }]]);
model("IngredientConfirmation", {
  scheduleFence: { type: Number, select: false },
  patientId: oid, cabinetItemId: oid, sourceRecordId: oid,
  cabinetRevision: Number, productId: String, ingredients: [Schema.Types.Mixed],
  confirmedBy: oid, confirmedAt: Date,
}, [[{ patientId: 1, cabinetItemId: 1 }, { unique: true }]]);
model("IngredientReview", {
  patientId: oid, cabinetItemIds: [oid], ingredientSnapshots: [Schema.Types.Mixed],
  evidenceRefs: [Schema.Types.Mixed], overlaps: [Schema.Types.Mixed], result: String,
  acknowledgedAt: Date, acknowledgedBy: oid, note: String,
});
model(
  "CabinetRevision",
  {
    patientId: oid,
    cabinetItemId: oid,
    revisionNumber: Number,
    actorUserId: oid,
    snapshot: Schema.Types.Mixed,
    reason: String,
    legacyBaseline: Boolean,
  },
  [
    [{ cabinetItemId: 1, revisionNumber: 1 }, { unique: true }],
    [{ patientId: 1, cabinetItemId: 1, createdAt: -1, _id: -1 }, {}],
  ],
);
model("Task", {
  patientId: oid,
  createdByUserId: oid,
  assigneeUserId: oid,
  title: String,
  description: String,
  type: String,
  status: String,
  dueAtUTC: Date,
  assignmentGeneration: Number,
  acknowledgedAt: Date,
  acknowledgedByUserId: oid,
  refillListId: oid,
  pharmacyPreferenceId: oid,
  pharmacySnapshot: Schema.Types.Mixed,
  followupId: oid,
});
model("TaskEvent", {
  patientId: oid,
  taskId: oid,
  actorUserId: oid,
  eventType: String,
  text: String,
  occurredAt: Date,
  fromStatus: String,
  toStatus: String,
  snapshot: Schema.Types.Mixed,
  noteId: oid,
  previousText: String,
});
model("TaskNote", {
  patientId: oid,
  taskId: oid,
  authorUserId: oid,
  text: String,
  deletedAt: Date,
}, [[{ patientId: 1, taskId: 1, createdAt: -1, _id: -1 }, {}]]);
model(
  "ChannelLink",
  {
    userId: oid,
    telegramUserId: String,
    chatId: String,
    consentedAt: Date,
    revokedAt: Date,
  },
  [
    [{ userId: 1 }, { unique: true }],
    [
      { telegramUserId: 1 },
      { unique: true, partialFilterExpression: { revokedAt: null } },
    ],
  ],
);
model(
  "ChannelChallenge",
  {
    userId: oid,
    tokenHash: String,
    expiresAt: Date,
    status: String,
    telegramUserId: String,
    chatId: String,
  },
  [
    [{ tokenHash: 1 }, { unique: true }],
    [{ expiresAt: 1 }, { expireAfterSeconds: 0 }],
  ],
);
model("TelegramReceipt", { updateId: Number }, [
  [{ updateId: 1 }, { unique: true }],
  [{ createdAt: 1 }, { expireAfterSeconds: 604800 }],
]);
model("WorkerState", { name: String, offset: Number, cursor: oid, lastActiveAt: Date }, [
  [{ name: 1 }, { unique: true }],
]);
model(
  "NotificationJob",
  {
    patientId: oid,
    taskId: oid,
    eventId: oid,
    recipientId: oid,
    generation: Number,
    channelLinkId: oid,
    channelRevision: Number,
    status: String,
    errorCode: String,
    attemptCount: Number,
    runAtUTC: Date,
    leaseUntil: Date,
  },
  [
    [{ eventId: 1, recipientId: 1 }, { unique: true }],
    [{ status: 1, runAtUTC: 1 }, {}],
    [{ patientId: 1, taskId: 1, createdAt: -1, _id: -1 }, {}],
  ],
);
model(
  "NotificationAttempt",
  {
    patientId: oid,
    jobId: oid,
    attemptNumber: Number,
    attemptedAt: Date,
    status: String,
    externalMessageId: String,
    errorCode: String,
  },
  [[{ jobId: 1, attemptNumber: 1 }, { unique: true }]],
);
model(
  "Acknowledgement",
  {
    patientId: oid,
    taskId: oid,
    generation: Number,
    userId: oid,
    acknowledgedAt: Date,
    mechanism: String,
  },
  [[{ taskId: 1, generation: 1, userId: 1 }, { unique: true }]],
);
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
model("Schedule", {
  patientId: oid, cabinetItemId: oid, prescriptionInstructionId: oid, currentVersionId: oid,
  status: String, pausedAt: Date, pauseReason: String, pauseEffectiveFromUTC: Date,
}, [[{ patientId: 1, prescriptionInstructionId: 1 }, { unique: true }]]);
model("ScheduleVersion", {
  patientId: oid, scheduleId: oid, versionNumber: Number,
  prescriptionInstructionId: oid, confirmedByUserId: oid, confirmedAt: Date,
  effectiveFromUTC: Date, endAtUTC: Date, timezone: String,
  timingMode: String, localTimes: [String], intervalMinutes: Number, anchorAtUTC: Date,
  doseQuantity: Schema.Types.Decimal128, doseUnit: String,
  sourceSnapshot: Schema.Types.Mixed, occurrenceCount: Number,
}, [[{ scheduleId: 1, versionNumber: 1 }, { unique: true }]]);
model("SchedulePreview", {
  patientId: oid, actorUserId: oid, tokenHash: String, expiresAt: Date,
  consumedAt: Date, payload: Schema.Types.Mixed,
}, [[{ tokenHash: 1 }, { unique: true }], [{ expiresAt: 1 }, { expireAfterSeconds: 0 }]]);
model("DoseOccurrence", {
  followupId: oid,
  patientId: oid, scheduleId: oid, scheduleVersionId: oid, cabinetItemId: oid,
  dueAtUTC: Date, doseQuantitySnapshot: Schema.Types.Decimal128, doseUnitSnapshot: String, timezoneSnapshot: String,
  state: { type: String, enum: ["pending", "taken", "skipped", "cancelled"] },
  reminderDueAtUTC: Date, snoozeCount: Number, actionRevision: Number,
  stockSyncStatus: String, stockIssue: String, stockActionId: oid, stockDeductionId: oid,
  reminderQueuedRevision: Number,
  cancelledAt: Date, cancellationReason: String,
}, [[{ scheduleVersionId: 1, dueAtUTC: 1 }, { unique: true }],
  [{ patientId: 1, scheduleId: 1, dueAtUTC: 1, _id: 1 }, {}]]);
models.DoseOccurrence.schema.index({ patientId: 1, dueAtUTC: 1, _id: 1 });
models.DoseOccurrence.schema.index({ patientId: 1, state: 1, reminderDueAtUTC: 1 });
models.DoseOccurrence.schema.index({ patientId: 1, cabinetItemId: 1, state: 1, dueAtUTC: 1, _id: 1 });
models.DoseOccurrence.schema.index({ patientId: 1, cabinetItemId: 1, state: 1, stockSyncStatus: 1, _id: -1 });
model("InventorySettings", {
  patientId: oid, cabinetItemId: oid, stockUnit: String, opened: Boolean,
  balanceMicros: Schema.Types.Decimal128, thresholdMicros: Schema.Types.Decimal128,
}, [[{ patientId: 1, cabinetItemId: 1 }, { unique: true }]]);
model("StockTransaction", {
  patientId: oid, cabinetItemId: oid, deltaMicros: Schema.Types.Decimal128,
  unit: String, reason: String, operationKey: String, actorUserId: oid,
  sourceDoseActionId: oid, reversesTransactionId: oid, note: String, recordedAt: Date,
}, [
  [{ patientId: 1, operationKey: 1 }, { unique: true }],
  [{ patientId: 1, cabinetItemId: 1, _id: -1 }, {}],
]);
model("RefillList", {
  patientId: oid, status: String, createdByUserId: oid, completedAt: Date, collectionTaskId: oid,
  items: [{
    cabinetItemId: oid, medicineText: String, requestedQuantity: String,
    unit: String, state: String, collectedAt: Date,
  }],
}, [[{ patientId: 1, _id: -1 }, {}]]);
model("PharmacyPreference", {
  patientId: oid, externalPlaceKey: String, listingSnapshot: Schema.Types.Mixed,
  sourceUrl: String, retrievedAt: Date, dataTimestamp: Date, savedByUserId: oid,
}, [[{ patientId: 1 }, { unique: true }]]);
model("DoseAction", {
  patientId: oid, occurrenceId: oid, revisionNumber: Number, action: String,
  previousState: String, newState: String, actorUserId: oid, recordedAt: Date,
  effectiveAt: Date, reason: String, isCorrection: Boolean, clientRequestId: String,
  reminderDueAtUTC: Date, stockSyncStatus: String,
}, [[{ occurrenceId: 1, revisionNumber: 1 }, { unique: true }],
  [{ patientId: 1, clientRequestId: 1 }, { unique: true }],
  [{ patientId: 1, occurrenceId: 1, createdAt: -1, _id: -1 }, {}]]);
model("DoseReminderSettings", {
  patientId: oid, ownerUserId: oid, enabled: Boolean, consentedAt: Date,
}, [[{ patientId: 1 }, { unique: true }], [{ enabled: 1, _id: 1 }, {}]]);
model("DoseReminderJob", {
  patientId: oid, occurrenceId: oid, recipientId: oid, actionRevision: Number,
  settingsRevision: Number, channelLinkId: oid, channelRevision: Number,
  status: String, errorCode: String, attemptCount: Number,
  runAtUTC: Date, expiresAtUTC: Date, leaseUntil: Date,
}, [[{ occurrenceId: 1, actionRevision: 1, recipientId: 1 }, { unique: true }],
  [{ status: 1, runAtUTC: 1 }, {}], [{ patientId: 1, occurrenceId: 1, createdAt: -1, _id: -1 }, {}]]);
model("DoseReminderAttempt", {
  patientId: oid, jobId: oid, attemptNumber: Number, attemptedAt: Date,
  providerCallAt: Date, status: String, externalMessageId: String, errorCode: String,
}, [[{ jobId: 1, attemptNumber: 1 }, { unique: true }]]);
models.DoseReminderJob.schema.index({ status: 1, leaseUntil: 1, _id: 1 });
for (const name of ["Prescription", "CabinetItem", "Task", "Schedule"])
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
  async lowStock(patientId, limit, session) {
    return models.InventorySettings.aggregate([
      { $match: { patientId, opened: true, $expr: { $lte: ["$balanceMicros", "$thresholdMicros"] } } },
      { $lookup: { from: collections.CabinetItem, localField: "cabinetItemId", foreignField: "_id", as: "cabinet" } },
      { $unwind: "$cabinet" },
      { $match: { "cabinet.patientId": patientId, "cabinet.status": "active" } },
      { $sort: { _id: 1 } },
      { $limit: limit },
    ]).session(session || null);
  },
  async count(name, filter) { return models[name].countDocuments(filter); },
  async fence(name, filter, session) {
    return models[name].updateOne(filter, { $inc: { scheduleFence: 1 } }, { session });
  },
  async insertMany(name, docs, session) {
    return models[name].insertMany(docs, { session });
  },
  async updateMany(name, filter, set, session) {
    return models[name].updateMany(filter, { $set: set, $inc: { revision: 1 } }, { session });
  },
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
  async list(name, filter, limit, session, sort = { createdAt: -1, _id: -1 }) {
    return models[name]
      .find(filter)
      .session(session || null)
      .sort(sort)
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
