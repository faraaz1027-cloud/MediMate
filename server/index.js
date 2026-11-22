import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import mongoose from "mongoose";
import { db } from "./v1/store.js";
import { createHttpApp } from "./http-app.js";
import { runtimeConfig, requireTransactions } from "./runtime-config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env using native Node process.loadEnvFile if MONGODB_URI is not set
if (!process.env.MONGODB_URI) {
  const envCandidates = [
    path.join(__dirname, ".env"),
    path.join(__dirname, "..", ".env"),
    path.join(process.cwd(), ".env"),
    path.join(process.cwd(), "server", ".env"),
  ];
  for (const p of envCandidates) {
    if (fs.existsSync(p)) {
      try {
        process.loadEnvFile(p);
        break;
      } catch {}
    }
  }
}

let config;
try {
  config = runtimeConfig();
} catch (error) {
  console.error("[Configuration] " + error.message);
  process.exit(1);
}
const { app, finish } = createHttpApp({
  db,
  config,
  readiness: async () => {
    if (mongoose.connection.readyState !== 1) return false;
    await mongoose.connection.db.command({ ping: 1 }, { timeoutMS: 1500 });
    return true;
  },
});
app.use(express.json({ limit: "2kb" }));

// Share the 'notes' collection for both DemoRecord and Note queries
const recordSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
  },
  { timestamps: true, collection: "notes" },
);

const Record =
  mongoose.models.DemoRecord || mongoose.model("DemoRecord", recordSchema);

// ─── Shared Handlers for /api/notes and /api/demo-records ─────────────────────
const getRecords = async (_req, res, next) => {
  try {
    const records = await Record.find()
      .sort({ createdAt: -1, _id: -1 })
      .limit(100)
      .lean();
    res.json(records);
  } catch (error) {
    next(error);
  }
};

const postRecord = async (req, res, next) => {
  const raw = req.body?.title;
  if (typeof raw !== "string" || !raw.trim()) {
    return res
      .status(400)
      .json({ error: "title is required and must be non-empty." });
  }
  const trimmed = raw.trim();
  if (trimmed.length > 120) {
    return res
      .status(400)
      .json({ error: "title must not exceed 120 characters." });
  }

  try {
    const created = await Record.create({ title: trimmed });
    res.status(201).json({
      _id: created._id,
      id: created._id,
      title: created.title,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    });
  } catch (error) {
    next(error);
  }
};

// Mount both routes to keep both local app and remote specification working
if (process.env.NODE_ENV !== "production") {
  app.get("/api/notes", getRecords);
  app.get("/api/demo-records", getRecords);
  app.post("/api/notes", postRecord);
  app.post("/api/demo-records", postRecord);
}

// ─── Database connection & Server initialization ──────────────────────────────
try {
  finish();
  await mongoose.connect(config.mongoUri, {
    serverSelectionTimeoutMS: 5000,
    maxPoolSize: 20,
  });
  if (config.production) await requireTransactions(mongoose.connection);
  await db.init();
  console.log("[MongoDB] Connected; API indexes ready.");
  const server = app.listen(config.port, config.host);
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  console.log(
    `[Express] Listening on ${config.host}:${config.port}; Vite client ${config.serveClient ? "served" : "disabled"}.`,
  );

  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    const deadline = setTimeout(() => {
      server.closeAllConnections();
      process.exit(1);
    }, 10000);
    deadline.unref();
    server.close(async () => {
      await mongoose.disconnect();
      clearTimeout(deadline);
      process.exit(0);
    });
    server.closeIdleConnections();
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
} catch {
  console.error(
    "[Startup] Unavailable. Check configuration, compiled client, transaction-capable database and port.",
  );
  await mongoose.disconnect();
  process.exit(1);
}
