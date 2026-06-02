import { startTransition } from "react";
import { hydrateRoot } from "react-dom/client";
import { HydratedRouter } from "react-router/dom";

import { bootstrapPlugins } from "./plugins.generated";

// Await bootstrap before hydrating so registry-derived gates (e.g. the
// `isImageFile` viewer gate) see plugin-contributed formats on the first
// client render, matching the server which also awaits before SSR. Plugin
// modules are already statically imported above, so this only waits for
// `register()` to run — it pulls in no extra bundle. (Built-ins still register
// lazily in ViewerStoreContext to keep viv + geotiff out of the entry chunk.)
await bootstrapPlugins({
  debug: (msg, fields) => console.debug("[plugin-bootstrap]", msg, fields ?? {}),
  info: (msg, fields) => console.info("[plugin-bootstrap]", msg, fields ?? {}),
  warn: (msg, fields) => console.warn("[plugin-bootstrap]", msg, fields ?? {}),
  error: (msg, fields) => console.error("[plugin-bootstrap]", msg, fields ?? {}),
}).catch((err) => {
  console.error("[plugin-bootstrap] unexpected bootstrap failure:", err);
});

startTransition(() => {
  hydrateRoot(document, <HydratedRouter />);
});
