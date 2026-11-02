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
import { SourceTextModule } from "node:vm";
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const serverRequire = createRequire(path.join(root, "server/package.json"));
const mongoose = serverRequire("mongoose"), express = serverRequire("express");
const { createV1 } = await import(pathToFileURL(path.join(root, "server/v1/app.js")).href);
const { db } = await import(pathToFileURL(path.join(root, "server/v1/store.js")).href);
const { createRxNorm } = await import(pathToFileURL(path.join(root, "server/v1/rxnorm.js")).href);
let rxnormDown=false;
const rxnorm=createRxNorm({spacingMs:0,fetchImpl:async url=>{
  if(rxnormDown)throw Error("controlled RxNorm outage");
  const p={rxcui:"198440",name:"acetaminophen 500 MG Oral Tablet",tty:"SCD",suppress:"N"};
  if(url.includes("drugs.json"))return Response.json({drugGroup:{conceptGroup:[{conceptProperties:url.includes("no-match")?[]:[p,{...p,rxcui:"100000",name:"Synthetic second candidate"}]}]}});
  return Response.json({properties:p});
}});
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
  app.use("/api/v1", createV1({ db, origins, rxnorm }));
  server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  origins.push(base);
  const jar = new CookieJar();
  const bundle = fs.readFileSync(
    root + "/client/dist" + fs.readFileSync(root + "/client/dist/index.html", "utf8").match(/<script[^>]+src="([^"]+)"/)[1],
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
    const module = new SourceTextModule(bundle, {
      context: dom.getInternalVMContext(),
      initializeImportMeta(meta) { meta.url = base + "/assets/entry.js"; },
    });
    await module.link(() => { throw new Error("Unexpected static module dependency in the production entry."); });
    await module.evaluate();
    return dom.window.document.body;
  }
  let body = await mount(),
    u = userEvent.setup({ document: dom.window.document });
  async function clickReady(element) {
    await waitFor(() => assert.equal(element.matches(":disabled"), false, "Expected enabled control: " + element.textContent), { container: body });
    await u.click(element);
  }
  await findByText(body, "Cannot reach the server. Check your connection and retry.");
  assert.equal(getByRole(body, "button", { name: "Sign in", exact: true }).disabled, true);
  offline = false;
  await clickReady(getByRole(body, "button", { name: "Reconnect to server", exact: true }));
  await waitFor(() => assert.equal(getByRole(body, "button", { name: "Sign in", exact: true }).disabled, false), { container: body });
  await findByRole(body, "button", { name: "Create a new account" });
  await clickReady(getByRole(body, "button", { name: "Create a new account" }));
  await u.type(
    getByLabelText(body, "Email", { exact: true }),
    "dom@example.test",
  );
  await u.type(
    getByLabelText(body, "Password", { exact: true }),
    "Synthetic-pass-123!",
  );
  await u.type(getByLabelText(body, "Display name"), "DOM owner");
  await clickReady(
    getByRole(body, "button", { name: "Create account", exact: true }),
  );
  await findByRole(body, "heading", { name: "Hello, DOM owner" });
  // Logout immediately after registration must show sign-in, not registration.
  await clickReady(getByRole(body, "button", { name: "Sign out", exact: true }));
  await findByRole(body, "heading", { name: "Welcome back" });
  await waitFor(() => assert.equal(getByRole(body, "button", { name: "Sign in", exact: true }).disabled, false), { container: body });
  await u.type(getByLabelText(body, "Email", { exact: true }), "dom@example.test");
  await u.type(getByLabelText(body, "Password", { exact: true }), "Synthetic-pass-123!");
  await clickReady(getByRole(body, "button", { name: "Sign in", exact: true }));
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
  await clickReady(getByRole(body, "button", { name: "Save draft", exact: true }));
  await findByText(body, "DOM prescription", { exact: true });
  await clickReady(
    getByRole(body, "button", { name: "Medicine cabinet", exact: true }),
  );
  await u.type(
    getByLabelText(body, "Medicine name", { exact: true }),
    "DOM cabinet",
  );
  await clickReady(
    getByRole(body, "button", { name: "Save medicine", exact: true }),
  );
  await findByText(body, "DOM cabinet", { exact: true });
  await clickReady(
    getByRole(body, "button", { name: "Caregiver tasks", exact: true }),
  );
  await u.type(getByLabelText(body, "Task title"), "DOM task");
  await clickReady(getByRole(body, "button", { name: "Save task", exact: true }));
  await findByText(body, "DOM task", { exact: true });
  body = await mount();
  u = userEvent.setup({ document: dom.window.document });
  await findByText(body, "DOM prescription", { exact: true });
  await clickReady(getByRole(body, "button", { name: "Sign out", exact: true }));
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
  await clickReady(getByRole(body, "button", { name: "Sign in", exact: true }));
  await findByText(body, "DOM prescription", { exact: true });
  // Expired authenticated sessions must return to a usable sign-in form.
  await mongoose.model("Session").updateMany({}, {
    $set: { expiresAt: new Date(0) },
  });
  await clickReady(getByRole(body, "button", { name: "Refresh", exact: true }));
  await findByRole(body, "heading", { name: "Welcome back" });
  await waitFor(() => assert.equal(getByRole(body, "button", { name: "Sign in", exact: true }).disabled, false), { container: body });
  await u.type(getByLabelText(body, "Email", { exact: true }), "dom@example.test");
  await u.type(getByLabelText(body, "Password", { exact: true }), "Synthetic-pass-123!");
  await clickReady(getByRole(body, "button", { name: "Sign in", exact: true }));
  await findByText(body, "DOM prescription", { exact: true });
  await clickReady(getByRole(body, "button", { name: "Sign out", exact: true }));
  await findByRole(body, "heading", { name: "Welcome back" });
  await waitFor(() => assert.equal(getByRole(body, "button", { name: "Sign in", exact: true }).disabled, false), { container: body });
  await u.type(getByLabelText(body, "Email", { exact: true }), "dom@example.test");
  await u.type(getByLabelText(body, "Password", { exact: true }), "Synthetic-pass-123!");
  // A login page left open past expiry must refresh CSRF without a reload.
  await mongoose.model("Session").updateMany({}, {
    $set: { expiresAt: new Date(0) },
  });
  await clickReady(getByRole(body, "button", { name: "Sign in", exact: true }));
  await findByRole(body, "alert");
  await waitFor(() => assert.equal(
    getByRole(body, "button", { name: "Sign in", exact: true }).disabled, false,
  ), { container: body });
  assert.equal(getByLabelText(body, "Email", { exact: true }).value, "dom@example.test");
  await clickReady(getByRole(body, "button", { name: "Sign in", exact: true }));
  await findByText(body, "DOM prescription", { exact: true });
  await clickReady(getByRole(body, "button", { name: "Account and access", exact: true }));
  await findByRole(body, "heading", { name: "Account and access" });
  const display = getByLabelText(body, "Account display name", { exact: true });
  await u.clear(display); await u.type(display, "Reviewed profile");
  await clickReady(getByRole(body, "button", { name: "Save profile", exact: true }));
  await findByRole(body, "heading", { name: "Hello, Reviewed profile" });
  await findByText(body, "Changes saved. Permissions apply on the next server request.");
  await u.type(getByLabelText(body, "New patient name", { exact: true }), "Second DOM patient");
  await clickReady(getByRole(body, "button", { name: "Create patient", exact: true }));
  await findByRole(body, "option", { name: "Second DOM patient", exact: true });
  await waitFor(() => assert.equal(getByRole(body, "button", { name: "Close account settings", exact: true }).disabled, false), { container: body });
  await clickReady(getByRole(body, "button", { name: "Close account settings", exact: true }));
  htmlList = true;
  await clickReady(getByRole(body, "button", { name: "Refresh", exact: true }));
  await findByText(body, "The server returned an unexpected response. Please retry.");
  assert.ok(getByText(body, "DOM prescription", { exact: true }));
  assert.equal(body.textContent.includes("No records yet."), false);
  await clickReady(getByRole(body, "button", { name: "Retry loading records", exact: true }));
  await findByText(body, "DOM prescription", { exact: true });
  await waitFor(() => assert.equal(body.textContent.includes("Retry loading records"), false), { container: body });
  await waitFor(() => assert.equal(getByRole(body, "button", { name: "New draft", exact: true }).disabled, false), { container: body });
  await clickReady(getByRole(body, "button", { name: "New draft", exact: true }));
  const titleField = getByLabelText(body, "Prescription title", { exact: true });
  await u.type(titleField, "   ");
  await u.type(getByLabelText(body, "Medicine name", { exact: true }), "Demo");
  await u.type(getByLabelText(body, "Instructions from prescription", { exact: true }), "Demo instructions");
  await clickReady(getByRole(body, "button", { name: "Save draft", exact: true }));
  await waitFor(() => assert.equal(titleField.getAttribute("aria-invalid"), "true"), { container: body });
  assert.equal(dom.window.document.activeElement, titleField);
  assert.ok(titleField.getAttribute("aria-describedby"));
  holdList = true;
  await clickReady(getByRole(body, "button", { name: "Refresh", exact: true }));
  await findByText(body, "Loading records…");
  await clickReady(getByRole(body, "button", { name: "Medicine cabinet", exact: true }));
  await findByText(body, "DOM cabinet", { exact: true });
  releaseList();
  await waitFor(() => assert.equal(staleFinished, true), { container: body });
  await clickReady(getByRole(body, "button", { name: "Refresh", exact: true }));
  await findByText(body, "DOM cabinet", { exact: true });
  assert.ok(getByRole(body, "heading", { name: "Hello, Reviewed profile" }));
  assert.equal(body.textContent.includes("DOM prescription"), false);
  await clickReady(getByRole(body, "button", { name: "Caregiver tasks", exact: true }));
  await u.type(getByLabelText(body, "Task title", { exact: true }), "Invalid assignee test");
  const assigneeField = getByLabelText(body, "Assign to user ID", { exact: true });
  await u.type(assigneeField, "f".repeat(24));
  await clickReady(getByRole(body, "button", { name: "Save task", exact: true }));
  await waitFor(() => assert.equal(assigneeField.getAttribute("aria-invalid"), "true"), { container: body });
  assert.equal(dom.window.document.activeElement, assigneeField);
  const currentUser = await mongoose.model("User").findOne({emailNormalized:"dom@example.test"});
  const organizer = await mongoose.model("User").create({emailNormalized:"organizer@example.test",displayName:"Organizer"});
  const shared = await mongoose.model("Patient").create({ownerUserId:organizer._id,displayName:"Shared read-only patient",timezone:"Asia/Dhaka",status:"active"});
  await mongoose.model("AccessGrant").create({patientId:shared._id,userId:currentUser._id,permissions:["task.read"]});
  await clickReady(getByRole(body, "button", { name: "Account and access", exact: true }));
  await waitFor(() => assert.equal(getByRole(body, "button", { name: "Refresh account details", exact: true }).disabled, false), { container: body });
  await clickReady(getByRole(body, "button", { name: "Refresh account details", exact: true }));
  await findByRole(body, "option", { name: "Shared read-only patient", exact: true });
  await u.selectOptions(getByRole(body, "combobox", { name: "Patient", exact: true }), String(shared._id));
  await findByText(body, "You do not have permission to create records in this area.");
  assert.equal(getByRole(body, "button", { name: "Save task", exact: true }).disabled, false);
  assert.equal(getByRole(body, "button", { name: "Save task", exact: true }).closest("fieldset").disabled, true);
  assert.equal(body.querySelector('button[aria-current="page"]').textContent, "Caregiver tasks");
  assert.equal([...body.querySelectorAll("nav button")].length, 1);
  // Step 21: exercise the actual editor rather than marking the create/list demo complete.
  await u.selectOptions(getByRole(body, "combobox", { name: "Patient", exact: true }), (await mongoose.model("Patient").findOne({displayName:"DOM owner"}))._id.toString());
  await clickReady(getByRole(body, "button", { name: "Prescriptions", exact: true }));
  await findByText(body, "DOM prescription", {exact:true});
  await clickReady(getByRole(body, "button", { name: "Review DOM prescription", exact: true }));
  await findByRole(body, "heading", { name: "Review prescription", exact: true });
  await waitFor(()=>assert.equal(getByLabelText(body,"Dose quantity",{exact:true}).value,""),{container:body});
  await u.type(getByLabelText(body,"Dose quantity",{exact:true}),"1.25");
  await u.selectOptions(getByLabelText(body,"Dose unit",{exact:true}),"tablet");
  await u.type(getByLabelText(body,"Timing from prescription",{exact:true}),"Synthetic timing");
  await u.type(getByLabelText(body,"Duration from prescription",{exact:true}),"Synthetic duration");
  const sharedCabinetItem=await mongoose.model("CabinetItem").findOne({displayName:"DOM cabinet"});
  await findByRole(body,"option",{name:/DOM cabinet/});
  await u.selectOptions(getByLabelText(body,"Saved medicine (optional)",{exact:true}),String(sharedCabinetItem._id));
  await clickReady(getByRole(body,"checkbox",{name:"Needs clarification or review",exact:true}));
  await clickReady(getByRole(body,"button",{name:"Save draft",exact:true}));
  await waitFor(()=>assert.equal(getByRole(body,"button",{name:"Confirm reviewed version",exact:true}).matches(":disabled"),false),{container:body});
  await clickReady(getByRole(body,"checkbox",{name:"I reviewed every instruction and resolved all ambiguities",exact:true}));
  await clickReady(getByRole(body,"button",{name:"Confirm reviewed version",exact:true}));
  await findByRole(body,"heading",{name:"Confirmed version 1",exact:true});
  await clickReady(getByRole(body,"button",{name:"Create replacement draft",exact:true}));
  await waitFor(()=>assert.equal(getByLabelText(body,"Dose quantity",{exact:true}).value,"1.25"),{container:body});
  assert.equal(getByLabelText(body,"Saved medicine (optional)",{exact:true}).value,String(sharedCabinetItem._id));
  await u.clear(getByLabelText(body,"Dose quantity",{exact:true}));
  await u.type(getByLabelText(body,"Dose quantity",{exact:true}),"2");
  await clickReady(getByRole(body,"button",{name:"Save draft",exact:true}));
  await waitFor(()=>assert.equal(getByRole(body,"button",{name:"Confirm reviewed version",exact:true}).matches(":disabled"),false),{container:body});
  await clickReady(getByRole(body,"button",{name:"Compare versions",exact:true}));
  await findByText(body,"doseQuantity: 1.25 → 2",{exact:true});
  await clickReady(getByRole(body,"checkbox",{name:"I reviewed every instruction and resolved all ambiguities",exact:true}));
  await clickReady(getByRole(body,"button",{name:"Confirm reviewed version",exact:true}));
  await findByRole(body,"heading",{name:"Confirmed version 2",exact:true});
  body=await mount();u=userEvent.setup({document:dom.window.document});
  await findByRole(body,"heading",{name:"Hello, Reviewed profile"});
  await u.selectOptions(getByRole(body,"combobox",{name:"Patient",exact:true}),(await mongoose.model("Patient").findOne({displayName:"DOM owner"}))._id.toString());
  await findByText(body,"DOM prescription",{exact:true});
  await clickReady(getByRole(body,"button",{name:"Review DOM prescription",exact:true}));
  await findByRole(body,"heading",{name:"Confirmed version 2",exact:true});
  await clickReady(getByRole(body,"button",{name:"View version 1",exact:true}));
  await findByRole(body,"heading",{name:"Historical version 1",exact:true});
  const firstVersion=await mongoose.model("PrescriptionVersion").findOne({versionNumber:1});
  assert.equal((await mongoose.model("PrescriptionInstruction").findOne({prescriptionVersionId:firstVersion._id})).doseQuantity.toString(),"1.25");
  assert.equal(String((await mongoose.model("PrescriptionInstruction").findOne({prescriptionVersionId:firstVersion._id})).cabinetItemId),String(sharedCabinetItem._id));
  // Step 22 uses a controlled upstream fixture; the live call is verified separately.
  await clickReady(getByRole(body,"button",{name:"Medicine cabinet",exact:true}));
  await findByText(body,"DOM cabinet",{exact:true});
  await u.type(getByLabelText(body,"Medicine search",{exact:true}),"demo");
  await clickReady(getByRole(body,"button",{name:"Search medicines",exact:true}));
  await findByRole(body,"button",{name:"Select 198440",exact:true});
  assert.equal(getByLabelText(body,"Medicine name",{exact:true}).value,"");
  await clickReady(getByRole(body,"button",{name:"Select 198440",exact:true}));
  await findByRole(body,"heading",{name:"Review selected medicine",exact:true});
  assert.equal(getByLabelText(body,"Medicine name",{exact:true}).readOnly,true);
  await u.type(getByLabelText(body,"Strength (optional)",{exact:true}),"500 MG");
  await u.type(getByLabelText(body,"Form (optional)",{exact:true}),"Oral Tablet");
  await clickReady(getByRole(body,"checkbox",{name:"I reviewed the selected name, strength and form",exact:true}));
  await clickReady(getByRole(body,"button",{name:"Save medicine",exact:true}));
  await findByRole(body,"heading",{name:"Cabinet item",exact:true});
  await waitFor(()=>assert.equal(getByLabelText(body,"Strength (optional)",{exact:true}).value,"500 MG"),{container:body});
  await u.clear(getByLabelText(body,"Strength (optional)",{exact:true}));
  await u.type(getByLabelText(body,"Strength (optional)",{exact:true}),"Reviewed source transcription");
  await u.type(getByLabelText(body,"Reason for change",{exact:true}),"Synthetic correction");
  await clickReady(getByRole(body,"button",{name:"Save changes",exact:true}));
  await findByText(body,"Revision 1 · active",{exact:true});
  await clickReady(getByRole(body,"button",{name:"Archive medicine",exact:true}));
  await findByText(body,"Revision 2 · archived",{exact:true});
  await u.selectOptions(getByLabelText(body,"Cabinet status",{exact:true}),"archived");
  await findByRole(body,"button",{name:"View acetaminophen 500 MG Oral Tablet",exact:true});
  rxnormDown=true;
  await u.clear(getByLabelText(body,"Medicine search",{exact:true}));await u.type(getByLabelText(body,"Medicine search",{exact:true}),"outage");
  await clickReady(getByRole(body,"button",{name:"Search medicines",exact:true}));
  await findByText(body,"RxNorm is unavailable. Retry or add a clearly labelled manual entry.",{exact:true});
  await clickReady(getByRole(body,"button",{name:"New manual entry",exact:true}));
  assert.equal(getByLabelText(body,"Medicine name",{exact:true}).readOnly,false);
  rxnormDown=false;
  await u.clear(getByLabelText(body,"Medicine search",{exact:true}));await u.type(getByLabelText(body,"Medicine search",{exact:true}),"no-match");
  await clickReady(getByRole(body,"button",{name:"Search medicines",exact:true}));
  await findByText(body,"No supported matches. Try another medicine name or add a manual entry.",{exact:true});
  body=await mount();u=userEvent.setup({document:dom.window.document});
  await findByRole(body,"heading",{name:"Hello, Reviewed profile"});
  await u.selectOptions(getByRole(body,"combobox",{name:"Patient",exact:true}),(await mongoose.model("Patient").findOne({displayName:"DOM owner"}))._id.toString());
  await clickReady(getByRole(body,"button",{name:"Medicine cabinet",exact:true}));
  await u.selectOptions(getByLabelText(body,"Cabinet status",{exact:true}),"archived");
  await clickReady(await findByRole(body,"button",{name:"View acetaminophen 500 MG Oral Tablet",exact:true}));
  await findByText(body,"Revision 0 · active",{exact:true});
  await findByText(body,"Revision 2 · archived",{exact:true});
  // Step 23 remains usable with Telegram disabled; this is not live Telegram evidence.
  await clickReady(getByRole(body,"button",{name:"Caregiver tasks",exact:true}));
  await findByText(body,"DOM task",{exact:true});
  await clickReady(getByRole(body,"button",{name:"View task DOM task",exact:true}));
  await findByText(body,"Task status: open",{exact:true});
  await findByText(body,"Telegram is not configured. Tasks and handover work without it; no Telegram delivery has been verified.",{exact:true});
  assert.equal(getByRole(body,"button",{name:"Generate Telegram linking code",exact:true}).disabled,true);
  await u.type(getByLabelText(body,"New handover note",{exact:true}),"Synthetic DOM handover");
  await clickReady(getByRole(body,"button",{name:"Add handover note",exact:true}));
  await findByText(body,"Synthetic DOM handover",{exact:true,selector:"p"});
  await clickReady(getByRole(body,"button",{name:"Acknowledge task notice",exact:true}));
  await waitFor(()=>assert.equal(body.textContent.includes("Acknowledged in the app at"),true),{container:body});
  await clickReady(getByRole(body,"button",{name:"Accept task",exact:true}));
  await findByText(body,"Task status: accepted",{exact:true});
  await clickReady(getByRole(body,"button",{name:"Complete task",exact:true}));
  await findByText(body,"Task status: completed",{exact:true});
  await clickReady(getByRole(body,"button",{name:"Reopen task",exact:true}));
  await findByText(body,"Task status: open",{exact:true});
  await findByText(body,"Not acknowledged by the assignee in the app.",{exact:true});
  await u.clear(getByLabelText(body,"Task title",{exact:true}));await u.type(getByLabelText(body,"Task title",{exact:true}),"DOM task reviewed");
  await clickReady(getByRole(body,"button",{name:"Save task changes",exact:true}));
  await findByText(body,"DOM task reviewed",{exact:true});
  body=await mount();u=userEvent.setup({document:dom.window.document});
  await findByRole(body,"heading",{name:"Hello, Reviewed profile"});
  await u.selectOptions(getByRole(body,"combobox",{name:"Patient",exact:true}),(await mongoose.model("Patient").findOne({displayName:"DOM owner"}))._id.toString());
  await clickReady(getByRole(body,"button",{name:"Caregiver tasks",exact:true}));
  await clickReady(await findByRole(body,"button",{name:"View task DOM task reviewed",exact:true}));
  await findByText(body,"Task status: open",{exact:true});
  await findByText(body,"Synthetic DOM handover",{exact:true,selector:"p"});
  assert.ok(body.textContent.includes("reopened"));
  const counts = {
    prescriptions: await mongoose.model("Prescription").countDocuments(),
    cabinet: await mongoose.model("CabinetItem").countDocuments(),
    tasks: await mongoose.model("Task").countDocuments(),
  };
  assert.deepEqual(counts, { prescriptions: 1, cabinet: 2, tasks: 1 });
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
          "Step 21 edit/review/confirm and replacement comparison",
          "Step 21 remount preserves confirmed version and prior instructions",
          "Step 22 explicit external selection, review, edit and archive",
          "Step 22 no-match/outage manual fallback and archived history after remount",
          "Step 23 handover, explicit acknowledgement, accept/complete/reopen and edit after remount",
          "Step 23 Telegram disabled status is explicit; live delivery remains unverified",
          "Step 24 explicit saved-medicine association survives replacement and remount in the shared patient workflow",
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
