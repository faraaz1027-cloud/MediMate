import fs from "node:fs";
import path from "node:path";
import express from "express";
import { createV1 } from "./v1/app.js";

// One origin serves the compiled Vite app and authenticated API. This preserves
// relative /api calls and SameSite=Lax cookies without cross-site CORS changes.
export function createHttpApp({ db, config, readiness, services = {} }) {
  const app = express();
  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    res.set("X-Content-Type-Options", "nosniff");
    next();
  });
  app.get("/api/health", async (_req, res) => {
    let connected = false;
    try {
      connected = !!(await readiness());
    } catch {}
    res
      .set("Cache-Control", "no-store")
      .status(connected ? 200 : 503)
      .json({ database: connected ? "connected" : "unavailable" });
  });
  app.use(
    "/api/v1",
    createV1({
      db,
      ...services,
      origins: config.origins,
      secure: config.production,
    }),
  );
  // Optional development-only Step 10 notes are installed before this handler.
  function finish() {
    app.use("/api", (_req, res) =>
      res
        .status(404)
        .json({
          error: { code: "NOT_FOUND", message: "API route not found." },
        }),
    );
    if (config.serveClient) {
      const index = path.join(config.clientDir, "index.html");
      if (!fs.existsSync(index))
        throw Error(
          "Build the Vite client before starting with SERVE_CLIENT=true.",
        );
      app.use(
        express.static(config.clientDir, {
          index: false,
          setHeaders(res, file) {
            res.set(
              "Cache-Control",
              file.includes(path.sep + "assets" + path.sep)
                ? "public, max-age=31536000, immutable"
                : "no-cache",
            );
          },
        }),
      );
      app.get(/.*/, (req, res, next) => {
        if (
          path.extname(req.path) ||
          /(^|\/)\./.test(req.path) ||
          !req.accepts("html")
        )
          return next();
        res.set("Cache-Control", "no-store").sendFile(index);
      });
    }
    app.use((_req, res) =>
      res
        .status(404)
        .json({ error: { code: "NOT_FOUND", message: "Route not found." } }),
    );
    app.use((error, _req, res, _next) => {
      if (error.type === "entity.parse.failed")
        return res.status(400).json({ error: "Invalid JSON." });
      if (error.type === "entity.too.large")
        return res.status(413).json({ error: "Request is too large." });
      res
        .status(503)
        .json({
          error: "Request unavailable. Check the connection and retry.",
        });
    });
    return app;
  }
  return { app, finish };
}
