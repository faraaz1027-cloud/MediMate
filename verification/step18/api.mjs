import { MongoMemoryReplSet } from "mongodb-memory-server";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readdir } from "node:fs/promises";

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
  const files = selected.length ? selected : (await readdir(new URL("../../server/test/", import.meta.url)))
    .filter(name => name.endsWith(".test.js")).sort().map(name => "server/test/" + name);
  const child = spawn(process.execPath, ["--test", "--test-concurrency=2", ...files], {
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
