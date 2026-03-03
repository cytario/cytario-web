import { createRequestHandler } from "@react-router/express";
import compression from "compression";
import express from "express";
import morgan from "morgan";
import path from "node:path";
import url from "node:url";

const BUILD_PATH = path.resolve("build/server/index.js");

const buildModule = await import(url.pathToFileURL(BUILD_PATH).href);

const app = express();

// Trust the first proxy (Traefik) so req.protocol reflects X-Forwarded-Proto
// and req.ip reflects X-Forwarded-For. This is critical for secure cookie
// handling when TLS is terminated at the reverse proxy.
app.set("trust proxy", 1);

app.disable("x-powered-by");

let isShuttingDown = false;

// Kubernetes readiness/liveness probe — before all middleware so it's fast and
// never blocked by compression, static-file serving, or request logging.
app.get("/healthz", (_req, res) => {
  if (isShuttingDown) {
    res.status(503).send("shutting down");
  } else {
    res.status(200).send("ok");
  }
});

app.use(compression());

// Vite-fingerprinted assets — immutable, cache forever
app.use(
  path.posix.join(buildModule.publicPath, "assets"),
  express.static(path.join(buildModule.assetsBuildDirectory, "assets"), {
    immutable: true,
    maxAge: "1y",
  }),
);

// Other build assets — short cache
app.use(
  buildModule.publicPath,
  express.static(buildModule.assetsBuildDirectory, { maxAge: "1h" }),
);

// Public static files (fonts, logos, etc.)
app.use(express.static("public", { maxAge: "1h" }));

app.use(morgan("tiny"));

app.all(
  "*",
  createRequestHandler({
    build: buildModule,
    mode: process.env.NODE_ENV,
  }),
);

const port = Number.parseInt(process.env.PORT || "3000", 10);
const host = process.env.HOST || "0.0.0.0";

const server = app.listen(port, host, () => {
  console.log(`[cytario-web] http://${host}:${port}`);
});

// Graceful shutdown on SIGTERM/SIGINT
const SHUTDOWN_DELAY_MS = 5_000;
const DRAIN_TIMEOUT_MS = 15_000;

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.once(signal, () => {
    console.log(`[cytario-web] ${signal} received, shutting down gracefully`);
    isShuttingDown = true;

    // Wait for load balancer to deregister the pod before closing connections
    setTimeout(() => {
      console.log("[cytario-web] closing server to new connections");
      server.close((err) => {
        if (err) {
          console.error("[cytario-web] error during close:", err);
        } else {
          console.log("[cytario-web] all connections drained, exiting");
        }
        process.exit(err ? 1 : 0);
      });

      // Force exit if connections don't drain in time
      setTimeout(() => {
        console.error("[cytario-web] drain timeout, forcing exit");
        process.exit(1);
      }, DRAIN_TIMEOUT_MS).unref();
    }, SHUTDOWN_DELAY_MS);
  });
}
