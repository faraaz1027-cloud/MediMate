// Test-only process harness. It never constructs the Telegram adapter or sends
// to a public host. Phase gates make actual process-crash boundaries observable.
import mongoose from 'mongoose';
import { db } from '../../v1/store.js';
import { createDoseWorker } from '../../v1/doseReminders.js';
import { TelegramError } from '../../v1/telegram.js';

let calls = 0;
const now = () => new Date(process.env.SYNTHETIC_NOW);
async function phase(name) {
  process.send?.({ phase: name });
  if (process.env.SYNTHETIC_STOP_AT === name)
    await new Promise(() => {});
}
const originalInsert = db.insert.bind(db);
db.insert = async (name, values, session) => {
  const created = await originalInsert(name, values, session);
  if (name === 'DoseReminderJob') await phase('queue_transaction_open');
  return created;
};
const originalUpdate = db.update.bind(db);
db.update = async (name, filter, values, session) => {
  if (name === 'DoseReminderAttempt' && values.providerCallAt)
    await phase('before_provider');
  return originalUpdate(name, filter, values, session);
};
await mongoose.connect(process.env.MONGODB_TEST_URI, {
  dbName: process.env.SYNTHETIC_DB_NAME,
});
try {
  await db.init();
  const worker = createDoseWorker({
    db, now,
    telegram: {
      enabled: process.env.SYNTHETIC_DISABLED !== '1',
      async sendDoseNotice() {
        calls++;
        if (process.env.SYNTHETIC_OUTCOME === 'failed')
          throw new TelegramError('RECIPIENT_BLOCKED');
        if (process.env.SYNTHETIC_OUTCOME === 'unknown')
          throw new TelegramError('OUTCOME_UNKNOWN', true);
        // The parent observes simulated acceptance through IPC independently
        // of this worker's later Mongo completion write.
        await phase('provider_accepted');
        return { messageId: 'synthetic-' + calls };
      },
    },
  });
  const queued = await worker.queueDue();
  await phase('queue_committed');
  let processed = 0;
  while (processed < 100 && await worker.deliverOne()) processed++;
  process.send?.({ done: true, queued, processed, calls });
} finally {
  await mongoose.disconnect();
  process.disconnect?.();
}
