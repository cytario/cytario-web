import { startTransition } from "react";
import { hydrateRoot } from "react-dom/client";
import { HydratedRouter } from "react-router/dom";

import { bootstrapPlugins } from "./plugins.generated";

startTransition(() => {
  hydrateRoot(document, <HydratedRouter />);
});

// Built-ins register lazily when ViewerStoreContext mounts — importing them
// here would pull viv + geotiff (multi-MB) into the entry bundle and delay
// hydration on non-viewer routes. Plugin bootstrap runs after hydrateRoot
// for the same reason.
void bootstrapPlugins({
  debug: (msg, fields) => console.debug("[plugin-bootstrap]", msg, fields ?? {}),
  info: (msg, fields) => console.info("[plugin-bootstrap]", msg, fields ?? {}),
  warn: (msg, fields) => console.warn("[plugin-bootstrap]", msg, fields ?? {}),
  error: (msg, fields) => console.error("[plugin-bootstrap]", msg, fields ?? {}),
}).catch((err) => {
  console.error("[plugin-bootstrap] unexpected bootstrap failure:", err);
});
