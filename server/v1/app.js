import { installPrescriptions } from "./prescriptions.js";
import { installCabinet } from "./cabinet.js";
import { createRxNorm } from "./rxnorm.js";
import { createTelegram } from "./telegram.js";
import { installChannels } from "./channels.js";
import { installTasks } from "./tasks.js";
import express from "express";
import mongoose from "mongoose";
import {
  randomBytes,
  randomUUID,
  createHash,
  scrypt as rawScrypt,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
const scrypt = promisify(rawScrypt),
  hash = (s) => createHash("sha256").update(s).digest("hex");
const permissionSet = [
  "prescription.read",
  "prescription.write",
  "prescription.confirm",
  "cabinet.read",
  "cabinet.write",
  "schedule.read",
  "schedule.write",
  "dose.read",
  "dose.record",
  "stock.read",
  "stock.write",
  "task.read",
  "task.write",
  "report.read",
  "report.write",
  "sos.activate",
  "sos.manage",
  "access.manage",
];
export class ApiError extends Error {
  constructor(status, code, message, fields = []) {
    super(message);
    Object.assign(this, { status, code, fields });
  }
}
const fail = (status, code, msg, fields) => {
  throw new ApiError(status, code, msg, fields);
};
const validId = (s) => typeof s === "string" && /^[a-f0-9]{24}$/i.test(s);
const id = (s) => {
  if (!validId(s)) fail(400, "INVALID_ID", "Invalid identifier.");
  return new mongoose.Types.ObjectId(s);
};
function object(body, allowed, required = []) {
  if (!body || typeof body !== "object" || Array.isArray(body))
    fail(422, "VALIDATION_ERROR", "Object body required.");
  for (const k of Object.keys(body))
    if (!allowed.includes(k))
      fail(422, "VALIDATION_ERROR", "Unknown field.", [
        { path: k, message: "Field is not accepted." },
      ]);
  for (const k of required)
    if (body[k] === undefined)
      fail(422, "VALIDATION_ERROR", "Required field missing.", [
        { path: k, message: "Required." },
      ]);
  return body;
}
function text(value, path, max = 200) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max)
    fail(422, "VALIDATION_ERROR", "Correct the highlighted fields.", [
      { path, message: `Enter 1–${max} characters.` },
    ]);
  return value.trim();
}
function canonical(x) {
  if (Array.isArray(x)) return x.map(canonical);
  if (x && typeof x === "object")
    return Object.fromEntries(
      Object.keys(x)
        .sort()
        .map((k) => [k, canonical(x[k])]),
    );
  return x;
}
function publicDoc(x) {
  if (!x) return x;
  const out = JSON.parse(JSON.stringify(x), (_k, v) =>
    v && typeof v === "object" && "$numberDecimal" in v ? v.$numberDecimal : v,
  );
  out.id = out._id;
  delete out._id;
  delete out.__v;
  return out;
}
function authInput(body, register = false) {
  object(
    body,
    register ? ["email", "password", "displayName"] : ["email", "password"],
    register ? ["email", "password", "displayName"] : ["email", "password"],
  );
  const email = text(body.email, "email", 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      fail(422, "VALIDATION_ERROR", "Valid email required.", [{ path: "email", message: "Enter a valid email address." }]);
  if (
    typeof body.password !== "string" ||
    body.password.length < 12 ||
    body.password.length > 128
  )
    fail(422, "VALIDATION_ERROR", "Password must contain 12–128 characters.", [{ path: "password", message: "Enter 12–128 characters." }]);
  return {
    email,
    password: body.password,
    displayName: register
      ? text(body.displayName, "displayName", 100)
      : undefined,
  };
}
export function createV1({
  db,
  rxnorm = createRxNorm(),
  telegram = createTelegram(),
  secure = process.env.NODE_ENV === "production",
  origins = ["http://localhost:5173", "http://127.0.0.1:5173"],
  now = () => new Date(),
}) {
  const app = express.Router(),
    attempts = new Map();
  app.use((req, res, next) => {
    req.requestId = randomUUID();
    res.set("Cache-Control", "no-store");
    next();
  });
  app.use(express.json({ limit: "64kb" }));
  const send = (req, res, data, status = 200, extra = {}) =>
    res
      .status(status)
      .json({ data, meta: { requestId: req.requestId, ...extra } });
  app.use(async (req, res, next) => {
    try {
      const match = (req.headers.cookie || "")
        .split(";")
        .map((s) => s.trim())
        .find((s) => s.startsWith("medimate_session="));
      const token = match?.slice("medimate_session=".length);
      if (token && /^[a-f0-9]{64}$/.test(token)) {
        req.session = await db.one("Session", {
          tokenHash: hash(token),
          expiresAt: { $gt: now() },
        });
      }
      next();
    } catch (e) {
      next(e);
    }
  });
  function throttle(req, res, next) {
    const key = req.ip + ":" + req.path,
      t = now().getTime(),
      old = attempts.get(key);
    const entry = old && old.until > t ? old : { count: 0, until: t + 60000 };
    if (attempts.size > 10000) attempts.clear();
    attempts.set(key, entry);
    if (++entry.count > 10) {
      res.set("Retry-After", "60");
      return next(
        new ApiError(429, "RATE_LIMITED", "Please retry in one minute."),
      );
    }
    next();
  }
  function csrf(req, res, next) {
    if (req.headers.origin && !origins.includes(req.headers.origin))
      return next(
        new ApiError(403, "ORIGIN_REJECTED", "Origin is not permitted."),
      );
    if (!req.session || req.get("X-CSRF-Token") !== req.session.csrfToken)
      return next(
        new ApiError(
          403,
          "CSRF_REJECTED",
          "Refresh the session token and retry.",
        ),
      );
    next();
  }
  function authenticated(req, res, next) {
    if (!req.session?.userId)
      return next(new ApiError(401, "UNAUTHENTICATED", "Sign in to continue."));
    req.actorId = req.session.userId;
    next();
  }
  async function session(req, res, userId) {
    if (req.session) await db.remove("Session", { _id: req.session._id });
    const token = randomBytes(32).toString("hex"),
      csrfToken = randomBytes(32).toString("hex");
    await db.insert("Session", {
      tokenHash: hash(token),
      csrfToken,
      userId,
      expiresAt: new Date(now().getTime() + 8 * 3600000),
    });
    res.cookie("medimate_session", token, {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/api/v1",
      maxAge: 8 * 3600000,
    });
    return csrfToken;
  }
  app.get("/auth/csrf", async (req, res) =>
    send(req, res, {
      csrfToken: req.session?.csrfToken || (await session(req, res)),
    }),
  );
  app.post("/auth/register", throttle, csrf, async (req, res) => {
    const b = authInput(req.body, true),
      salt = randomBytes(16).toString("hex");
    const passwordHash =
      salt + ":" + (await scrypt(b.password, salt, 64)).toString("hex");
    const r = await db.transaction(async (s) => {
      const u = await db.insert(
        "User",
        { emailNormalized: b.email, displayName: b.displayName, passwordHash },
        s,
      );
      const p = await db.insert(
        "Patient",
        {
          ownerUserId: u._id,
          displayName: b.displayName,
          timezone: "Asia/Dhaka",
          status: "active",
        },
        s,
      );
      return { u, p };
    });
    const csrfToken = await session(req, res, r.u._id);
    return send(
      req,
      res,
      {
        user: {
          id: String(r.u._id),
          email: b.email,
          displayName: b.displayName,
        },
        patientId: String(r.p._id),
        csrfToken,
      },
      201,
    );
  });
  app.post("/auth/login", throttle, csrf, async (req, res) => {
    const b = authInput(req.body),
      u = await db.one("User", { emailNormalized: b.email });
    const [salt, stored] = (
      u?.passwordHash || "invalid:" + Buffer.alloc(64).toString("hex")
    ).split(":");
    const candidate = await scrypt(b.password, salt, 64);
    if (!u || !timingSafeEqual(candidate, Buffer.from(stored, "hex")))
      fail(401, "INVALID_CREDENTIALS", "Invalid email or password.");
    send(req, res, {
      user: {
        id: String(u._id),
        email: u.emailNormalized,
        displayName: u.displayName,
      },
      csrfToken: await session(req, res, u._id),
    });
  });
  app.post("/auth/logout", authenticated, csrf, async (req, res) => {
    await db.remove("Session", { _id: req.session._id });
    res.clearCookie("medimate_session", {
      path: "/api/v1",
      httpOnly: true,
      secure,
      sameSite: "lax",
    });
    res.sendStatus(204);
  });
  async function accessiblePatients(actorId) {
    const grants = await db.list(
      "AccessGrant",
      { userId: actorId, revokedAt: null },
      1000,
    );
    return db.list(
      "Patient",
      {
        status: "active",
        $or: [
          { ownerUserId: actorId },
          { _id: { $in: grants.map((g) => g.patientId) } },
        ],
      },
      100,
    );
  }
  app.get("/auth/me", authenticated, async (req, res) => {
    const u = await db.one("User", { _id: req.actorId });
    send(req, res, {
      id: String(u._id),
      email: u.emailNormalized,
      displayName: u.displayName,
      revision: u.revision,
      permissionCatalog: permissionSet.filter((p) => p !== "access.manage"),
      patients: await Promise.all((await accessiblePatients(req.actorId)).map(async (p) => {
        const owner = String(p.ownerUserId) === String(req.actorId);
        const grant = owner ? null : await db.one("AccessGrant", {
          patientId: p._id, userId: req.actorId, revokedAt: null,
        });
        return { id: String(p._id), displayName: p.displayName,
          timezone: p.timezone, revision: p.revision,
          role: owner ? "owner" : "caregiver",
          permissions: owner ? permissionSet : grant?.permissions || [] };
      })),
    });
  });
  function revision(value) {
    if (!Number.isInteger(value) || value < 0)
      fail(422, "VALIDATION_ERROR", "Integer revision required.");
    return value;
  }
  function timezone(value) {
    if (typeof value !== "string" || value.length > 100)
      fail(422, "VALIDATION_ERROR", "Valid IANA timezone required.", [{ path: "timezone", message: "Enter a valid IANA timezone, for example Asia/Dhaka." }]);
    try { new Intl.DateTimeFormat("en", { timeZone: value }); }
    catch { fail(422, "VALIDATION_ERROR", "Valid IANA timezone required.", [{ path: "timezone", message: "Enter a valid IANA timezone, for example Asia/Dhaka." }]); }
    return value;
  }
  app.patch("/me", authenticated, csrf, async (req, res) => {
    const b = object(req.body, ["displayName", "expectedRevision"], ["displayName", "expectedRevision"]);
    const displayName = text(b.displayName, "displayName", 100);
    revision(b.expectedRevision);
    await mutate(req, res, null, async (s) => {
      const u = await db.update("User", { _id: req.actorId, revision: b.expectedRevision }, { displayName }, s);
      if (!u) fail(409, "REVISION_CONFLICT", "Reload your profile and retry.");
      return { id: String(u._id), displayName: u.displayName, email: u.emailNormalized, revision: u.revision };
    }, 200);
  });
  app.post("/patients", authenticated, csrf, async (req, res) => {
    const b = object(req.body, ["displayName", "timezone"], ["displayName", "timezone"]);
    const displayName = text(b.displayName, "displayName", 100), zone = timezone(b.timezone);
    await mutate(req, res, null, async (s) => publicDoc(await db.insert("Patient", {
      ownerUserId: req.actorId, displayName, timezone: zone, status: "active",
    }, s)));
  });
  async function access(req, permission, s) {
    const p = await db.one(
      "Patient",
      { _id: id(req.params.patientId), status: "active" },
      s,
    );
    if (!p) fail(404, "NOT_FOUND", "Record not found.");
    if (String(p.ownerUserId) === String(req.actorId)) return p;
    const grant = await db.one(
      "AccessGrant",
      { patientId: p._id, userId: req.actorId, revokedAt: null },
      s,
    );
    if (!grant) fail(404, "NOT_FOUND", "Record not found.");
    if (permission && !grant.permissions.includes(permission))
      fail(403, "FORBIDDEN", "This operation is not permitted.");
    return p;
  }
  const scope = (permission) => async (req, res, next) => {
    try {
      req.patient = await access(req, permission);
      next();
    } catch (e) {
      next(e);
    }
  };
  const patient = express.Router({ mergeParams: true });
  app.use("/patients/:patientId", authenticated, patient);
  patient.get("/", scope(null), (req, res) =>
    send(req, res, publicDoc(req.patient)),
  );
  async function mutate(req, res, permission, fn, status = 201, prepare, present = value => value) {
    const key = req.get("Idempotency-Key");
    if (
      !key ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        key,
      )
    )
      fail(400, "IDEMPOTENCY_REQUIRED", "Supply a UUID Idempotency-Key.");
    const requestHash = hash(JSON.stringify(canonical(req.body))),
      route = req.method + (req.patient ? "/patients/:patientId" : "") + req.path;
    const query = {
      patientId: req.patient?._id || null,
      actorUserId: req.actorId,
      key,
      route,
    };
    async function replay(s) {
      if (req.patient) await access(req, permission, s);
      const old = await db.one("Operation", query, s);
      if (old && old.requestHash !== requestHash)
        fail(
          409,
          "IDEMPOTENCY_CONFLICT",
          "This key was used for different input.",
        );
      return old;
    }
    // Resolve external data before opening a transaction. A successful replay
    // must remain usable during an upstream outage; access is checked again below.
    if (prepare && !(await replay())) await prepare();
    let result;
    try {
      result = await db.transaction(async (s) => {
        const old = await replay(s);
        if (old) return { ...old, status: 200 };
        const response = await fn(s);
        await db.insert(
          "AuditEvent",
          {
            patientId: req.patient?._id,
            actorUserId: req.actorId,
            action: route,
            requestId: req.requestId,
          },
          s,
        );
        return db.insert(
          "Operation",
          { ...query, requestHash, status, response },
          s,
        );
      });
    } catch (e) {
      if (e.code === 11000) {
        result = await replay();
        if (!result) throw e;
        result = { ...result, status: 200 };
      } else throw e;
    }
    send(req, res, present(result.response), result.status);
  }
  const ownerOnly = (req) => {
    if (String(req.patient.ownerUserId) !== String(req.actorId))
      fail(403, "FORBIDDEN", "Owner access required.");
  };
  function grantPermissions(value) {
    if (!Array.isArray(value) || !value.length || value.length > permissionSet.length ||
      value.some((p) => !permissionSet.includes(p) || p === "access.manage"))
      fail(422, "VALIDATION_ERROR", "Choose named caregiver permissions; only owners manage access.");
    return [...new Set(value)];
  }
  patient.patch("/", csrf, scope("access.manage"), async (req, res) => {
    ownerOnly(req);
    const b = object(req.body, ["displayName", "timezone", "expectedRevision"], ["displayName", "timezone", "expectedRevision"]);
    const displayName = text(b.displayName, "displayName", 100), zone = timezone(b.timezone);
    revision(b.expectedRevision);
    await mutate(req, res, "access.manage", async (s) => {
      const p = await db.update("Patient", { _id: req.patient._id, revision: b.expectedRevision }, { displayName, timezone: zone }, s);
      if (!p) fail(409, "REVISION_CONFLICT", "Reload the patient and retry.");
      return publicDoc(p);
    }, 200);
  });
  patient.get("/access-grants", scope("access.manage"), async (req, res) => {
    ownerOnly(req);
    if (Object.keys(req.query).length) fail(400, "INVALID_QUERY", "Unsupported query.");
    const rows = await db.list("AccessGrant", { patientId: req.patient._id }, 101);
    if (rows.length > 100) fail(422, "GRANT_LIMIT", "Contact the project owner to review grant pagination.");
    send(req, res, rows.map(publicDoc));
  });
  patient.patch("/access-grants/:grantId", csrf, scope("access.manage"), async (req, res) => {
    ownerOnly(req);
    const b = object(req.body, ["permissions", "expectedRevision"], ["permissions", "expectedRevision"]);
    const permissions = grantPermissions(b.permissions), grantId = id(req.params.grantId);
    revision(b.expectedRevision);
    await mutate(req, res, "access.manage", async (s) => {
      const current = await db.one("AccessGrant", { _id: grantId, patientId: req.patient._id }, s);
      if (!current) fail(404, "NOT_FOUND", "Record not found.");
      const g = await db.update("AccessGrant", { _id: grantId, patientId: req.patient._id, revision: b.expectedRevision },
        { permissions, revokedAt: null }, s);
      if (!g) fail(409, "REVISION_CONFLICT", "Reload the grant and retry.");
      return publicDoc(g);
    }, 200);
  });
  patient.post(
    "/access-grants",
    csrf,
    scope("access.manage"),
    async (req, res) => {
      if (String(req.patient.ownerUserId) !== String(req.actorId))
        fail(403, "FORBIDDEN", "Owner access required.");
      const b = object(
        req.body,
        ["userId", "permissions"],
        ["userId", "permissions"],
      );
      const userId = id(b.userId);
      const permissions = grantPermissions(b.permissions);
      if (String(userId) === String(req.actorId))
        fail(422, "VALIDATION_ERROR", "The owner already has full access.");
      if (!(await db.one("User", { _id: userId })))
        fail(422, "VALIDATION_ERROR", "Registered user required.");
      await mutate(req, res, "access.manage", (s) =>
        db
          .insert(
            "AccessGrant",
            {
              patientId: req.patient._id,
              userId,
              permissions,
            },
            s,
          )
          .then(publicDoc),
      );
    },
  );
  patient.post(
    "/access-grants/:grantId/revoke",
    csrf,
    scope("access.manage"),
    async (req, res) => {
      if (String(req.patient.ownerUserId) !== String(req.actorId))
        fail(403, "FORBIDDEN", "Owner access required.");
      object(req.body, ["expectedRevision"], ["expectedRevision"]);
      if (
        !Number.isInteger(req.body.expectedRevision) ||
        req.body.expectedRevision < 0
      )
        fail(422, "VALIDATION_ERROR", "Integer revision required.");
      await mutate(
        req,
        res,
        "access.manage",
        async (s) => {
          if (
            !(await db.one(
              "AccessGrant",
              { _id: id(req.params.grantId), patientId: req.patient._id },
              s,
            ))
          )
            fail(404, "NOT_FOUND", "Record not found.");
          const g = await db.update(
            "AccessGrant",
            {
              _id: id(req.params.grantId),
              patientId: req.patient._id,
              revision: req.body.expectedRevision,
            },
            { revokedAt: now() },
            s,
          );
          if (!g) fail(409, "REVISION_CONFLICT", "Reload the grant and retry.");
          return publicDoc(g);
        },
        200,
      );
    },
  );
  installPrescriptions(patient, { db, csrf, scope, mutate, fail, id, object, text, publicDoc, now });
  installCabinet(patient, { db, csrf, scope, mutate, fail, id, object, text, publicDoc, rxnorm });
  installChannels(app, { db, authenticated, csrf, mutate, object, fail, id, telegram, now, throttle });
  installTasks(patient, { db, csrf, scope, mutate, fail, id, object, text, publicDoc, now, telegram });
  const resources = [
    ["prescriptions", "Prescription", "prescription"],
  ];
  for (const [route, model, perm] of resources) {
    patient.get("/" + route, scope(perm + ".read"), async (req, res) => {
      if (
        Object.keys(req.query).some(
          (k) => !["limit", "cursor", "status"].includes(k),
        ) ||
        Object.values(req.query).some((v) => typeof v !== "string")
      )
        fail(400, "INVALID_QUERY", "Unsupported query.");
      let limit = req.query.limit === undefined ? 20 : Number(req.query.limit);
      if (!Number.isInteger(limit) || limit < 1 || limit > 100)
        fail(400, "INVALID_QUERY", "Limit must be 1–100.");
      const filter = { patientId: req.patient._id };
      if (req.query.cursor) {
        try {
          const c = JSON.parse(
            Buffer.from(req.query.cursor, "base64url").toString(),
          );
          if (!validId(c.id) || !Number.isFinite(Date.parse(c.createdAt)))
            throw new Error();
          filter.$or = [
            { createdAt: { $lt: new Date(c.createdAt) } },
            { createdAt: new Date(c.createdAt), _id: { $lt: id(c.id) } },
          ];
        } catch {
          fail(400, "INVALID_CURSOR", "Invalid pagination cursor.");
        }
      }
      if (req.query.status) {
        const allowed =
          model === "Task"
            ? ["open", "accepted", "completed", "cancelled"]
            : ["active", "archived"];
        if (!allowed.includes(req.query.status))
          fail(400, "INVALID_QUERY", "Unknown status.");
        filter.status = req.query.status;
      }
      const rows = await db.list(model, filter, limit + 1),
        more = rows.length > limit;
      rows.splice(limit);
      const last = rows.at(-1);
      send(req, res, rows.map(publicDoc), 200, {
        limit,
        filters: req.query.status ? { status: req.query.status } : {},
        nextCursor: more
          ? Buffer.from(
              JSON.stringify({
                id: String(last._id),
                createdAt: last.createdAt,
              }),
            ).toString("base64url")
          : null,
      });
    });
  }

  app.use((req, res, next) =>
    next(new ApiError(404, "NOT_FOUND", "Endpoint not found.")),
  );
  app.use((e, req, res, _next) => {
    let status = e instanceof ApiError ? e.status : 503,
      code = e instanceof ApiError ? e.code : "DEPENDENCY_UNAVAILABLE",
      message =
        e instanceof ApiError
          ? e.message
          : "Database operation unavailable. Check MongoDB and replica-set setup.";
    if (e.type === "entity.parse.failed") {
      status = 400;
      code = "INVALID_JSON";
      message = "Invalid JSON.";
    }
    if (e.type === "entity.too.large") {
      status = 413;
      code = "REQUEST_TOO_LARGE";
      message = "Request is too large.";
    }
    if (e.code === 11000) {
      status = 409;
      code = "DUPLICATE_RECORD";
      message = "A matching record already exists.";
    }
    res.status(status).json({
      error: { code, message, fields: e.fields || [] },
      meta: { requestId: req.requestId },
    });
  });
  return app;
}
