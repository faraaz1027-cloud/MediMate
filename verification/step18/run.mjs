import { MongoMemoryReplSet } from "mongodb-memory-server";
import { JSDOM, CookieJar } from "jsdom";
import {
  getByRole,
  getByLabelText,
  findByText,
  findByRole,
  waitFor,
} from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const { default: mongoose } = await import(
  pathToFileURL(path.join(root, "node_modules/mongoose/index.js")).href
);
const { default: express } = await import(
  pathToFileURL(path.join(root, "node_modules/express/index.js")).href
);
const { createV1 } = await import(pathToFileURL(path.join(root, "server/v1/app.js")).href);
const { db } = await import(pathToFileURL(path.join(root, "server/v1/store.js")).href);
const replica = await MongoMemoryReplSet.create({
  binary: { version: "7.0.24" },
  replSet: {
    count: 1,
    args: [
      ...(process.platform === "win32" ? [] : ["--nounixsocket"]),
      "--setParameter",
      "diagnosticDataCollectionEnabled=false",
    ],
  },
});
let server, dom;
try {
  await mongoose.connect(replica.getUri(), { dbName: "dom_test" });
  await db.init();
  const app = express(),
    origins = [];
  app.use("/api/v1", createV1({ db, origins }));
  server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  origins.push(base);
  const jar = new CookieJar();
  const bundle = fs.readFileSync(
    root +
      "/client/dist/assets/" +
      fs
        .readdirSync(root + "/client/dist/assets")
        .find((n) => n.endsWith(".js")),
    "utf8",
  );
  async function mount() {
    dom?.window.close();
    dom = new JSDOM('<div id="root"></div>', {
      url: base,
      runScripts: "outside-only",
      pretendToBeVisual: true,
      cookieJar: jar,
    });
    dom.window.AbortController = globalThis.AbortController;
    dom.window.fetch = async (path, opts = {}) => {
      const url = new URL(path, base).href;
      const r = await fetch(url, {
        ...opts,
        headers: {
          ...opts.headers,
          Cookie: await jar.getCookieString(url),
          ...(opts.method ? { Origin: base } : {}),
        },
      });
      for (const c of r.headers.getSetCookie()) await jar.setCookie(c, url);
      return r;
    };
    dom.window.eval(bundle);
    return dom.window.document.body;
  }
  let body = await mount(),
    u = userEvent.setup({ document: dom.window.document });
  await findByRole(body, "button", { name: "Create a new account" });
  await u.click(getByRole(body, "button", { name: "Create a new account" }));
  await u.type(
    getByLabelText(body, "Email", { exact: true }),
    "dom@example.test",
  );
  await u.type(
    getByLabelText(body, "Password", { exact: true }),
    "Synthetic-pass-123!",
  );
  await u.type(getByLabelText(body, "Display name"), "DOM owner");
  await u.click(
    getByRole(body, "button", { name: "Create account", exact: true }),
  );
  await findByRole(body, "heading", { name: "Hello, DOM owner" });
  await u.type(getByLabelText(body, "Prescription title"), "DOM prescription");
  await u.type(
    getByLabelText(body, "Medicine name", { exact: true }),
    "Demo medicine",
  );
  await u.type(
    getByLabelText(body, "Instructions from prescription"),
    "Synthetic instructions",
  );
  await u.click(getByRole(body, "button", { name: "Save draft", exact: true }));
  await findByText(body, "DOM prescription", { exact: true });
  await u.click(
    getByRole(body, "button", { name: "Medicine cabinet", exact: true }),
  );
  await u.type(
    getByLabelText(body, "Medicine name", { exact: true }),
    "DOM cabinet",
  );
  await u.click(
    getByRole(body, "button", { name: "Save medicine", exact: true }),
  );
  await findByText(body, "DOM cabinet", { exact: true });
  await u.click(
    getByRole(body, "button", { name: "Caregiver tasks", exact: true }),
  );
  await u.type(getByLabelText(body, "Task title"), "DOM task");
  await u.click(getByRole(body, "button", { name: "Save task", exact: true }));
  await findByText(body, "DOM task", { exact: true });
  body = await mount();
  u = userEvent.setup({ document: dom.window.document });
  await findByText(body, "DOM prescription", { exact: true });
  await u.click(getByRole(body, "button", { name: "Sign out", exact: true }));
  await findByRole(body, "heading", { name: "Welcome back" });
  await waitFor(() => assert.equal(getByRole(body, "button", { name: "Sign in", exact: true }).disabled, false), { container: body });
  await u.type(
    getByLabelText(body, "Email", { exact: true }),
    "dom@example.test",
  );
  await u.type(
    getByLabelText(body, "Password", { exact: true }),
    "Synthetic-pass-123!",
  );
  await u.click(getByRole(body, "button", { name: "Sign in", exact: true }));
  await findByText(body, "DOM prescription", { exact: true });
  // Expired authenticated sessions must return to a usable sign-in form.
  await mongoose.model("Session").updateMany({}, {
    $set: { expiresAt: new Date(0) },
  });
  await u.click(getByRole(body, "button", { name: "Refresh", exact: true }));
  await findByRole(body, "heading", { name: "Welcome back" });
  await waitFor(() => assert.equal(getByRole(body, "button", { name: "Sign in", exact: true }).disabled, false), { container: body });
  await u.type(getByLabelText(body, "Email", { exact: true }), "dom@example.test");
  await u.type(getByLabelText(body, "Password", { exact: true }), "Synthetic-pass-123!");
  await u.click(getByRole(body, "button", { name: "Sign in", exact: true }));
  await findByText(body, "DOM prescription", { exact: true });
  await u.click(getByRole(body, "button", { name: "Sign out", exact: true }));
  await findByRole(body, "heading", { name: "Welcome back" });
  await waitFor(() => assert.equal(getByRole(body, "button", { name: "Sign in", exact: true }).disabled, false), { container: body });
  await u.type(getByLabelText(body, "Email", { exact: true }), "dom@example.test");
  await u.type(getByLabelText(body, "Password", { exact: true }), "Synthetic-pass-123!");
  // A login page left open past expiry must refresh CSRF without a reload.
  await mongoose.model("Session").updateMany({}, {
    $set: { expiresAt: new Date(0) },
  });
  await u.click(getByRole(body, "button", { name: "Sign in", exact: true }));
  await findByRole(body, "alert");
  await waitFor(() => assert.equal(
    getByRole(body, "button", { name: "Sign in", exact: true }).disabled, false,
  ), { container: body });
  assert.equal(getByLabelText(body, "Email", { exact: true }).value, "dom@example.test");
  await u.click(getByRole(body, "button", { name: "Sign in", exact: true }));
  await findByText(body, "DOM prescription", { exact: true });
  const counts = {
    prescriptions: await mongoose.model("Prescription").countDocuments(),
    cabinet: await mongoose.model("CabinetItem").countDocuments(),
    tasks: await mongoose.model("Task").countDocuments(),
  };
  assert.deepEqual(counts, { prescriptions: 1, cabinet: 1, tasks: 1 });
  fs.writeFileSync(
    root + "/docs/evidence/step18-dom.json",
    JSON.stringify(
      {
        runAt: new Date().toISOString(),
        runner:
          "JSDOM + Testing Library user-event; production React bundle; real MongoDB 7.0.24 replica set",
        passed: [
          "registration",
          "prescription create/list",
          "cabinet create/list",
          "task create/list",
          "remount persistence",
          "logout/login",
          "patient rediscovery",
          "authenticated session expiry and sign-in recovery",
          "anonymous session expiry and explicit CSRF retry",
        ],
        counts,
        limitations:
          "No real browser layout or screenshot verification; Chromium download failed.",
      },
      null,
      2,
    ),
  );
  console.log("DOM integration passed", counts);
} finally {
  dom?.window.close();
  if (server) await new Promise((r) => server.close(r));
  await mongoose.disconnect();
  await replica.stop();
}
