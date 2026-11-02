import { MongoMemoryReplSet } from "mongodb-memory-server";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const replica = await MongoMemoryReplSet.create({
  ...(process.env.MONGOMS_DB_PATH ? { instanceOpts: [{ dbPath: process.env.MONGOMS_DB_PATH }] } : {}),
  binary: { version: "7.0.24" },
  // API suites advance an injected application clock. Keep MongoDB's wall-clock
  // TTL sweep from deleting those fixtures; expiry is still checked by the API.
  replSet: { count: 1, args: ["--setParameter", "ttlMonitorEnabled=false"] },
});
try {
  const child = spawn(process.execPath, ["--test", "server/test/api.test.js", "server/test/prescriptions.test.js", "server/test/cabinet.test.js", "server/test/rxnorm.test.js", "server/test/tasks.test.js", "server/test/telegram.test.js", "server/test/module1.test.js", "server/test/schedules.test.js"], {
    cwd: fileURLToPath(new URL("../../", import.meta.url)),
    env: { ...process.env, MONGODB_TEST_URI: replica.getUri() },
    stdio: "inherit",
  });
  process.exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
} finally {
  await replica.stop();
}
