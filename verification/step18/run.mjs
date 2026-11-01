import { MongoMemoryReplSet } from "mongodb-memory-server";
import { JSDOM, CookieJar } from "jsdom";
import {
  getByRole,
  getByText,
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
import { createRequire } from "node:module";
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const serverRequire = createRequire(path.join(root, "server/package.json"));
const mongoose = serverRequire("mongoose"), express = serverRequire("express");
const { createV1 } = await import(pathToFileURL(path.join(root, "server/v1/app.js")).href);
const { db } = await import(pathToFileURL(path.join(root, "server/v1/store.js")).href);
const replica = await MongoMemoryReplSet.create({
  ...(process.env.MONGOMS_DB_PATH ? { instanceOpts: [{ dbPath: process.env.MONGOMS_DB_PATH }] } : {}),
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
let offline = true, htmlList = false, holdList = false, releaseList, staleFinished;
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
      if (offline) throw new TypeError("injected offline transport");
      if (String(path).includes("/prescriptions?")) {
        if (htmlList) { htmlList = false; return new Response("<html>proxy unavailable</html>", { status: 502 }); }
        if (holdList) {
          holdList = false;
          await new Promise((resolve) => { releaseList = resolve; });
          staleFinished = true;
          return new Response(JSON.stringify({ error: { code: "UNAUTHENTICATED", message: "stale session response" } }), { status: 401 });
        }
      }
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
  await findByText(body, "Cannot reach the server. Check your connection and retry.");
  assert.equal(getByRole(body, "button", { name: "Sign in", exact: true }).disabled, true);
  offline = false;
  await u.click(getByRole(body, "button", { name: "Reconnect to server", exact: true }));
  await waitFor(() => assert.equal(getByRole(body, "button", { name: "Sign in", exact: true }).disabled, false), { container: body });
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
  // Logout immediately after registration must show sign-in, not registration.
  await u.click(getByRole(body, "button", { name: "Sign out", exact: true }));
  await findByRole(body, "heading", { name: "Welcome back" });
  await waitFor(() => assert.equal(getByRole(body, "button", { name: "Sign in", exact: true }).disabled, false), { container: body });
  await u.type(getByLabelText(body, "Email", { exact: true }), "dom@example.test");
  await u.type(getByLabelText(body, "Password", { exact: true }), "Synthetic-pass-123!");
  await u.click(getByRole(body, "button", { name: "Sign in", exact: true }));
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
  await u.click(getByRole(body, "button", { name: "Account and access", exact: true }));
  await findByRole(body, "heading", { name: "Account and access" });
  const display = getByLabelText(body, "Account display name", { exact: true });
  await u.clear(display); await u.type(display, "Reviewed profile");
  await u.click(getByRole(body, "button", { name: "Save profile", exact: true }));
  await findByRole(body, "heading", { name: "Hello, Reviewed profile" });
  await findByText(body, "Changes saved. Permissions apply on the next server request.");
  await u.type(getByLabelText(body, "New patient name", { exact: true }), "Second DOM patient");
  await u.click(getByRole(body, "button", { name: "Create patient", exact: true }));
  await findByRole(body, "option", { name: "Second DOM patient", exact: true });
  await waitFor(() => assert.equal(getByRole(body, "button", { name: "Close account settings", exact: true }).disabled, false), { container: body });
  await u.click(getByRole(body, "button", { name: "Close account settings", exact: true }));
  htmlList = true;
  await u.click(getByRole(body, "button", { name: "Refresh", exact: true }));
  await findByText(body, "The server returned an unexpected response. Please retry.");
  assert.ok(getByText(body, "DOM prescription", { exact: true }));
  assert.equal(body.textContent.includes("No records yet."), false);
  await u.click(getByRole(body, "button", { name: "Retry loading records", exact: true }));
  await findByText(body, "DOM prescription", { exact: true });
  await waitFor(() => assert.equal(body.textContent.includes("Retry loading records"), false), { container: body });
  const titleField = getByLabelText(body, "Prescription title", { exact: true });
  await u.type(titleField, "   ");
  await u.type(getByLabelText(body, "Medicine name", { exact: true }), "Demo");
  await u.type(getByLabelText(body, "Instructions from prescription", { exact: true }), "Demo instructions");
  await u.click(getByRole(body, "button", { name: "Save draft", exact: true }));
  await waitFor(() => assert.equal(titleField.getAttribute("aria-invalid"), "true"), { container: body });
  assert.equal(dom.window.document.activeElement, titleField);
  assert.ok(titleField.getAttribute("aria-describedby"));
  holdList = true;
  await u.click(getByRole(body, "button", { name: "Refresh", exact: true }));
  await findByText(body, "Loading records…");
  await u.click(getByRole(body, "button", { name: "Medicine cabinet", exact: true }));
  await findByText(body, "DOM cabinet", { exact: true });
  releaseList();
  await waitFor(() => assert.equal(staleFinished, true), { container: body });
  await u.click(getByRole(body, "button", { name: "Refresh", exact: true }));
  await findByText(body, "DOM cabinet", { exact: true });
  assert.ok(getByRole(body, "heading", { name: "Hello, Reviewed profile" }));
  assert.equal(body.textContent.includes("DOM prescription"), false);
  await u.click(getByRole(body, "button", { name: "Caregiver tasks", exact: true }));
  await u.type(getByLabelText(body, "Task title", { exact: true }), "Invalid assignee test");
  const assigneeField = getByLabelText(body, "Assign to user ID", { exact: true });
  await u.type(assigneeField, "f".repeat(24));
  await u.click(getByRole(body, "button", { name: "Save task", exact: true }));
  await waitFor(() => assert.equal(assigneeField.getAttribute("aria-invalid"), "true"), { container: body });
  assert.equal(dom.window.document.activeElement, assigneeField);
  const currentUser = await mongoose.model("User").findOne({emailNormalized:"dom@example.test"});
  const organizer = await mongoose.model("User").create({emailNormalized:"organizer@example.test",displayName:"Organizer"});
  const shared = await mongoose.model("Patient").create({ownerUserId:organizer._id,displayName:"Shared read-only patient",timezone:"Asia/Dhaka",status:"active"});
  await mongoose.model("AccessGrant").create({patientId:shared._id,userId:currentUser._id,permissions:["task.read"]});
  await u.click(getByRole(body, "button", { name: "Account and access", exact: true }));
  await waitFor(() => assert.equal(getByRole(body, "button", { name: "Refresh account details", exact: true }).disabled, false), { container: body });
  await u.click(getByRole(body, "button", { name: "Refresh account details", exact: true }));
  await findByRole(body, "option", { name: "Shared read-only patient", exact: true });
  await u.selectOptions(getByRole(body, "combobox", { name: "Patient", exact: true }), String(shared._id));
  await findByText(body, "You do not have permission to create records in this area.");
  assert.equal(getByRole(body, "button", { name: "Save task", exact: true }).disabled, false);
  assert.equal(getByRole(body, "button", { name: "Save task", exact: true }).closest("fieldset").disabled, true);
  assert.equal(body.querySelector('button[aria-current="page"]').textContent, "Caregiver tasks");
  assert.equal([...body.querySelectorAll("nav button")].length, 1);
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
          "account profile edit and patient creation",
          "Step 20 offline startup reconnect",
          "Step 20 non-JSON list error retains records and retries",
          "Step 20 whitespace and server field errors focus associated inputs",
          "Step 20 slow stale 401 cannot replace current tab or log out",
          "Step 20 permission-aware navigation and read-only controls",
        ],
        counts,
        limitations:
          "JSDOM does not verify browser layout or accessibility; see separate Step 19 browser smoke evidence.",
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
