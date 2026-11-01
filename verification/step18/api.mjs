import { MongoMemoryReplSet } from "mongodb-memory-server";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const replica = await MongoMemoryReplSet.create({
  binary: { version: "7.0.24" },
  replSet: { count: 1 },
});
try {
  const child = spawn(process.execPath, ["--test", "server/test/api.test.js"], {
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
