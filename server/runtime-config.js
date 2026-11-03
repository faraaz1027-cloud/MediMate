import path from "node:path";
import { fileURLToPath } from "node:url";

export const projectRoot = fileURLToPath(new URL("../", import.meta.url));
export function runtimeConfig(env = process.env) {
  const production = env.NODE_ENV === "production";
  const port = Number(env.PORT || (production ? 10000 : 3001));
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw Error("PORT must be an integer between 1 and 65535.");
  const mongoUri =
    env.MONGODB_URI ||
    (!production && "mongodb://127.0.0.1:27017/medimate_demo");
  if (!mongoUri || !/^mongodb(\+srv)?:\/\/\S+$/.test(mongoUri))
    throw Error(
      "Set MONGODB_URI privately to the application's replica-set database.",
    );
  const rawOrigins =
    env.ALLOWED_ORIGINS ||
    (!production && "http://localhost:5173,http://127.0.0.1:5173");
  if (!rawOrigins)
    throw Error("Set ALLOWED_ORIGINS to the deployed HTTPS web origin.");
  const origins = [
    ...new Set(
      rawOrigins.split(",").map((value) => {
        try {
          const url = new URL(value.trim());
          if (
            !["https:", ...(!production ? ["http:"] : [])].includes(
              url.protocol,
            ) ||
            url.username ||
            url.password ||
            url.hostname.includes("*") ||
            url.search ||
            url.hash ||
            url.pathname !== "/"
          )
            throw Error();
          return url.origin;
        } catch {
          throw Error(
            "ALLOWED_ORIGINS must contain exact web origins (HTTPS in production).",
          );
        }
      }),
    ),
  ];
  if (
    env.SERVE_CLIENT !== undefined &&
    !["true", "false"].includes(env.SERVE_CLIENT)
  )
    throw Error("SERVE_CLIENT must be true or false.");
  return {
    production,
    port,
    mongoUri,
    origins,
    host: env.HOST || (production ? "0.0.0.0" : "127.0.0.1"),
    serveClient:
      env.SERVE_CLIENT === undefined ? production : env.SERVE_CLIENT === "true",
    clientDir: path.join(projectRoot, "client", "dist"),
  };
}

export async function requireTransactions(connection) {
  const hello = await connection.db.admin().command({ hello: 1 });
  if (
    (!hello.setName && hello.msg !== "isdbgrid") ||
    hello.logicalSessionTimeoutMinutes == null
  )
    throw Error(
      "The deployed API requires a transaction-capable MongoDB replica set or mongos.",
    );
}
