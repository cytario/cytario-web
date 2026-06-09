/* global process, console */
// Distroless has no shell, so the container entrypoint runs under Node.
// Applies pending migrations, then hands off to the start command passed
// as argv (CMD), forwarding termination signals for graceful shutdown.
import { spawn, spawnSync } from "node:child_process";

const PRISMA_CLI = "node_modules/prisma/build/index.js";

console.log("Running database migrations...");
const migrate = spawnSync(process.execPath, [PRISMA_CLI, "migrate", "deploy"], {
  stdio: "inherit",
});
if (migrate.status !== 0) {
  process.exit(migrate.status ?? 1);
}

const args = process.argv.slice(2);
console.log("Starting application...");
const child = spawn(process.execPath, args, { stdio: "inherit" });

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
