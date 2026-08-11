// server.ts
import "dotenv/config";
import { createRequestHandler } from "@react-router/express";
import compression from "compression";
import express from "express";
import morgan from "morgan";
import path from "path";
import url from "url";
var BUILD_PATH = path.resolve("build/server/index.js");
var buildModule = await import(url.pathToFileURL(BUILD_PATH).href);
var app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");
var isShuttingDown = false;
app.get("/healthz", (_req, res) => {
  if (isShuttingDown) {
    res.status(503).send("shutting down");
  } else {
    res.status(200).send("ok");
  }
});
app.use(compression());
app.use(
  path.posix.join(buildModule.publicPath, "assets"),
  express.static(path.join(buildModule.assetsBuildDirectory, "assets"), {
    immutable: true,
    maxAge: "1y",
  }),
);
app.use(buildModule.publicPath, express.static(buildModule.assetsBuildDirectory, { maxAge: "1h" }));
app.use(express.static("public", { maxAge: "1h" }));
app.use(morgan("tiny"));
app.all(
  "*",
  createRequestHandler({
    build: buildModule,
    mode: process.env.NODE_ENV,
  }),
);
var port = Number.parseInt(process.env.PORT || "3000", 10);
var host = process.env.HOST || "0.0.0.0";
var server = app.listen(port, host, () => {
  console.log(`[cytario-web] http://${host}:${port}`);
});
var SHUTDOWN_DELAY_MS = 5e3;
var DRAIN_TIMEOUT_MS = 15e3;
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.once(signal, () => {
    console.log(`[cytario-web] ${signal} received, shutting down gracefully`);
    isShuttingDown = true;
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
      setTimeout(() => {
        console.error("[cytario-web] drain timeout, forcing exit");
        process.exit(1);
      }, DRAIN_TIMEOUT_MS).unref();
    }, SHUTDOWN_DELAY_MS);
  });
}
//# sourceMappingURL=server.js.map
