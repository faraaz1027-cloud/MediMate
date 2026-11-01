import mongoose from "mongoose";
import { db } from "./v1/store.js";
import { createTelegram } from "./v1/telegram.js";
import { createTaskWorker } from "./v1/taskNotifications.js";

const telegram = createTelegram();
if (!telegram.enabled) {
  console.error(
    "Telegram worker is disabled. Configure TELEGRAM_BOT_TOKEN and TELEGRAM_BOT_USERNAME privately.",
  );
  process.exitCode = 1;
} else if (!process.env.MONGODB_URI) {
  console.error(
    "Configure a replica-set MONGODB_URI before starting the worker.",
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
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    await db.init();
    const worker = createTaskWorker({ db, telegram });
    console.log(
      "Telegram task worker started. Run only one poller for this bot. No tokens or chat content are logged.",
    );
    while (!stopping) {
      try {
        await worker.pollOnce();
      } catch {
        console.error(
          "Telegram polling unavailable. Check configuration/webhook conflicts; retrying after pause.",
        );
        await pause(5000);
      }
      for (let i = 0; i < 10 && !stopping; i++) {
        try {
          if (!(await worker.deliverOne())) break;
        } catch {
          console.error(
            "Task delivery could not finish. Persisted leases preserve an unknown outcome after interruption.",
          );
          break;
        }
        await pause(1100);
      }
      if (!stopping) await pause(250);
    }
  } catch {
    console.error("Worker database connection unavailable.");
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}
