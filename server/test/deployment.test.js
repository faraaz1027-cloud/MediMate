import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import net from "node:net";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { runtimeConfig } from "../runtime-config.js";
import { createHttpApp } from "../http-app.js";
const requireVerification = createRequire(
  new URL("../../verification/step18/package.json", import.meta.url),
);
const { MongoMemoryServer } = requireVerification("mongodb-memory-server");

test("Step 29 production configuration rejects missing database/origin and insecure or invalid settings", () => {
  assert.throws(() => runtimeConfig({ NODE_ENV: "production" }), /MONGODB_URI/);
  const env = {
    NODE_ENV: "production",
    MONGODB_URI: "mongodb://127.0.0.1/demo",
  };
  assert.throws(() => runtimeConfig(env), /ALLOWED_ORIGINS/);
  for (const origin of [
    "*",
    "https://*.example.test",
    "http://public.example",
    "https://name:secret@example.test",
    "https://example.test/path",
  ])
    assert.throws(
      () => runtimeConfig({ ...env, ALLOWED_ORIGINS: origin }),
      /exact web origins/,
    );
  assert.throws(
    () =>
      runtimeConfig({
        ...env,
        ALLOWED_ORIGINS: "https://example.test",
        PORT: "0",
      }),
    /PORT/,
  );
  assert.throws(
    () =>
      runtimeConfig({
        ...env,
        ALLOWED_ORIGINS: "https://example.test",
        SERVE_CLIENT: "yes",
      }),
    /SERVE_CLIENT/,
  );
  const valid = runtimeConfig({
    ...env,
    ALLOWED_ORIGINS: "https://example.test/",
  });
  assert.equal(valid.host, "0.0.0.0");
  assert.equal(valid.serveClient, true);
  assert.deepEqual(valid.origins, ["https://example.test"]);
});

test("Step 29 health fails closed without leaking dependency details; missing client build fails startup", async (t) => {
  const config = { production: false, origins: [], serveClient: false };
  const { app, finish } = createHttpApp({
    db: {},
    config,
    readiness: async () => {
      throw Error("synthetic-private-uri");
    },
  });
  finish();
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(() => new Promise((r) => server.close(r)));
  const r = await fetch(`http://127.0.0.1:${server.address().port}/api/health`);
  assert.equal(r.status, 503);
  assert.deepEqual(await r.json(), { database: "unavailable" });
  assert.throws(
    () =>
      createHttpApp({
        db: {},
        config: {
          ...config,
          serveClient: true,
          clientDir: fileURLToPath(
            new URL("./no-built-client", import.meta.url),
          ),
        },
        readiness: async () => true,
      }).finish(),
    /Build the Vite client/,
  );
});

async function freePort() {
  const s = net.createServer();
  s.listen(0, "127.0.0.1");
  await new Promise((r) => s.once("listening", r));
  const port = s.address().port;
  await new Promise((r) => s.close(r));
  return port;
}
function launch(env) {
  const child = spawn(
    process.execPath,
    ["--env-file-if-exists=.env", "index.js"],
    {
      cwd: fileURLToPath(new URL("../", import.meta.url)),
      env: {
        ...process.env,
        NODE_ENV: "production",
        SERVE_CLIENT: "true",
        HOST: "0.0.0.0",
        ALLOWED_ORIGINS: "https://medimate.example.test",
        TELEGRAM_BOT_TOKEN: "",
        TELEGRAM_BOT_USERNAME: "",
        ...env,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  let settled = false;
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(Error("Production startup deadline exceeded"));
    }, 15000);
    const collect = (b) => {
      output += b;
      if (!settled && output.includes("[Express] Listening")) {
        settled = true;
        clearTimeout(timer);
        resolve();
      }
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.once("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.once("exit", () => {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        resolve();
      }
    });
  });
  const exited = new Promise((resolve) =>
    child.once("exit", (code, signal) => resolve({ code, signal })),
  );
  return { child, ready, exited, output: () => output };
}

test(
  "Step 29 actual production entrypoint serves Vite and authenticated API, preserves DB across process restart",
  { timeout: 45000 },
  async (t) => {
    const uri = new URL(process.env.MONGODB_TEST_URI);
    uri.pathname = "/production_" + randomUUID().replaceAll("-", "");
    const port = await freePort();
    const env = { MONGODB_URI: uri.toString(), PORT: String(port) };
    let running = launch(env);
    await running.ready;
    t.after(async () => {
      if (
        running.child.exitCode === null &&
        running.child.signalCode === null
      ) {
        running.child.kill("SIGTERM");
        await running.exited;
      }
    });
    assert.match(running.output(), /Listening on 0.0.0.0:/);
    const base = `http://127.0.0.1:${port}`;
    const page = await fetch(base);
    assert.equal(page.status, 200);
    assert.match(page.headers.get("content-type"), /text\/html/);
    const html = await page.text();
    assert.match(html, /MediMate/);
    assert.match(page.headers.get("cache-control"), /no-store/);
    const asset = html.match(/src="([^"]+\.js)"/)[1];
    const script = await fetch(base + asset);
    assert.equal(script.status, 200);
    assert.match(script.headers.get("cache-control"), /immutable/);
    const fallback = await fetch(base + "/review/doses", {
      headers: { Accept: "text/html" },
    });
    assert.equal(fallback.status, 200);
    for (const route of [
      "/api/notes",
      "/api/demo-records",
      "/api/v1/unknown",
      "/assets/missing.js",
      "/.env",
      "/server/index.js",
    ]) {
      const r = await fetch(base + route);
      assert.equal(r.status, 404, route);
      assert.match(r.headers.get("content-type"), /json/);
    }
    assert.deepEqual(await (await fetch(base + "/api/health")).json(), {
      database: "connected",
    });
    let cookie = "",
      csrf = "";
    async function call(
      method,
      path,
      body,
      origin = "https://medimate.example.test",
    ) {
      const r = await fetch(base + "/api/v1" + path, {
        method,
        headers: {
          Origin: origin,
          "Content-Type": "application/json",
          Cookie: cookie,
          "X-CSRF-Token": csrf,
          "Idempotency-Key": randomUUID(),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (r.headers.get("set-cookie")) {
        assert.match(r.headers.get("set-cookie"), /Secure/);
        assert.match(r.headers.get("set-cookie"), /HttpOnly/);
        assert.match(r.headers.get("set-cookie"), /SameSite=Lax/);
        cookie = r.headers.get("set-cookie").split(";")[0];
      }
      const b = await r.json();
      if (b.data?.csrfToken) csrf = b.data.csrfToken;
      return { status: r.status, body: b };
    }
    await call("GET", "/auth/csrf");
    const a = await call("POST", "/auth/register", {
      email: "production-" + randomUUID() + "@example.test",
      password: "Synthetic-pass-123!",
      displayName: "Synthetic production reviewer",
    });
    assert.equal(a.status, 201);
    const p = "/patients/" + a.body.data.patientId;
    const bad = await call(
      "POST",
      p + "/cabinet-items",
      { entryType: "manual", displayName: "Rejected synthetic" },
      "https://wrong.example.test",
    );
    assert.equal(bad.status, 403);
    const saved = await call("POST", p + "/cabinet-items", {
      entryType: "manual",
      displayName: "Synthetic production item",
    });
    assert.equal(saved.status, 201);
    const id = saved.body.data.id;
    running.child.kill("SIGTERM");
    const stopped = await running.exited;
    if (process.platform !== "win32") assert.equal(stopped.code, 0);
    running = launch(env);
    await running.ready;
    assert.match(running.output(), /Listening/);
    const list = await call("GET", p + "/cabinet-items");
    assert.equal(list.status, 200);
    assert.deepEqual(
      list.body.data.map((x) => x.id),
      [id],
    );
    assert.ok(!running.output().includes(uri.toString()));
  },
);

test(
  "Step 29 actual production entrypoint rejects standalone Mongo before exposing the API",
  { timeout: 30000 },
  async (t) => {
    const mongo = await MongoMemoryServer.create({
      binary: { version: "7.0.24" },
    });
    t.after(() => mongo.stop());
    const uri = mongo.getUri("standalone_synthetic");
    const child = launch({ MONGODB_URI: uri, PORT: String(await freePort()) });
    await child.ready;
    const result = await child.exited;
    assert.equal(result.code, 1);
    assert.doesNotMatch(child.output(), /\[Express\] Listening/);
    assert.ok(!child.output().includes(uri));
  },
);
