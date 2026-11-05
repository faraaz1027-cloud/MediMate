import { MongoMemoryReplSet } from "mongodb-memory-server";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const replica = await MongoMemoryReplSet.create({
  ...(process.env.MONGOMS_DB_PATH ? { instanceOpts: [{ dbPath: process.env.MONGOMS_DB_PATH }] } : {}),
  binary: { version: "7.0.24" },
  // API suites advance an injected application clock. Keep MongoDB's wall-clock
  // TTL sweep from deleting those fixtures; expiry is still checked by the API.
  // Crash fixtures intentionally kill a client with an open transaction. Bound
  // its server-side lifetime in this disposable test replica only.
  replSet: { count: 1, args: ["--setParameter", "ttlMonitorEnabled=false", "--setParameter", "transactionLifetimeLimitSeconds=5"] },
});
try {
  const selected = process.argv.slice(2);
  const child = spawn(process.execPath, ["--test", ...(selected.length ? selected : ["server/test/api.test.js", "server/test/prescriptions.test.js", "server/test/cabinet.test.js", "server/test/rxnorm.test.js", "server/test/tasks.test.js", "server/test/telegram.test.js", "server/test/module1.test.js", "server/test/schedules.test.js", "server/test/openfda.test.js", "server/test/information-cards.test.js", "server/test/doses.test.js", "server/test/dose-worker-cli.test.js", "server/test/timezone-restarts.test.js", "server/test/deployment.test.js", "server/test/module2.test.js", "server/test/inventory.test.js"])], {
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
