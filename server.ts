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
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.once(signal, () => {
    server.close((err) => {
      if (err) console.error(err);
      process.exit(err ? 1 : 0);
    });
  });
}
