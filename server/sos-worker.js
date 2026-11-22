import mongoose from "mongoose";
import { db } from "./v1/store.js";
import { createTelegram } from "./v1/telegram.js";
import { createSosWorker } from "./v1/sos-worker.js";
import { requireTransactions } from "./runtime-config.js";

if (!process.env.MONGODB_URI) {
  console.error(
    "Set a replica-set MONGODB_URI before running the SOS worker.",
  );
  process.exitCode = 1;
} else {
  let stopping = false;
  process.on("SIGINT", () => {
    stopping = true;
  });
  process.on("SIGTERM", () => {
    stopping = true;
  });
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    if(process.env.NODE_ENV === 'production') await requireTransactions(mongoose.connection);
    await db.init();
    const telegram = createTelegram(),
      worker = createSosWorker({ db, telegram });
    console.log(
      telegram.enabled
        ? "SOS notification worker started; channel acceptance is not a reading receipt."
        : "Telegram is not configured. Queued SOS notices will be recorded as disabled; no messages are sent.",
    );
    do {
      try {
        const queued = await worker.queueDue();
        let processed = 0;
        for (; processed < 20 && !stopping; processed++) {
          if (!(await worker.deliverOne())) break;
          await new Promise((r) => setTimeout(r, 1100));
        }
        if (process.argv.includes("--once"))
          console.log(
            JSON.stringify({
              queued,
              processed,
              telegramConfigured: telegram.enabled,
            }),
          );
      } catch {
        console.error(
          "SOS processing unavailable. Persisted records/leases remain for inspection.",
        );
        if (process.argv.includes("--once")) process.exitCode = 1;
      }
      if (process.argv.includes("--once")) break;
      for (let i = 0; i < 5 && !stopping; i++)
        await new Promise((r) => setTimeout(r, 200));
    } while (!stopping);
  } catch {
    console.error("SOS worker database unavailable.");
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}
