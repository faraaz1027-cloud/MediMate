import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import mongoose from "mongoose";
import { db } from "./v1/store.js";
import { createV1 } from "./v1/app.js";

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

const PORT = Number(process.env.PORT) || 3001;
const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/medimate_demo";

const app = express();
app.disable("x-powered-by");
app.use(
  "/api/v1",
  createV1({
    db,
    origins: (
      process.env.ALLOWED_ORIGINS ||
      "http://localhost:5173,http://127.0.0.1:5173"
    )
      .split(",")
      .map((s) => s.trim()),
  }),
);
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

// ─── Health check ─────────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  const isConnected = mongoose.connection.readyState === 1;
  res.status(isConnected ? 200 : 503).json({
    database: isConnected ? "connected" : "unavailable",
  });
});

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

// ─── Error handling middleware ────────────────────────────────────────────────
app.use((error, _req, res, _next) => {
  if (error.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Invalid JSON." });
  }
  if (error.type === "entity.too.large") {
    return res.status(413).json({ error: "Request is too large." });
  }
  res.status(503).json({
    error: "Database request failed. Check the connection and retry.",
  });
});

// ─── Database connection & Server initialization ──────────────────────────────
try {
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  await db.init();
  console.log("[MongoDB] Connected; API indexes ready.");
  const server = app.listen(PORT, "127.0.0.1", () => {
    console.log(`[Express] Listening on http://127.0.0.1:${PORT}`);
  });

  const stop = async () => {
    server.close(async () => {
      await mongoose.disconnect();
      process.exit(0);
    });
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
} catch (err) {
  console.error(
    "[MongoDB] Connection failed. Check server/.env and ensure MongoDB is running:",
    "Connection or index initialization failed.",
  );
  process.exit(1);
}
