# @cytario/plugin-api

Plugin API for Cytario Web. A third-party npm package exporting a default `CytarioPlugin` can be loaded at build time (via `CYTARIO_PLUGINS=...`) to contribute file-format handlers — and, in future revisions, other extension types — to the host.

## Public surface

```ts
import type {
  CytarioPlugin,
  PluginContext,
  FormatRegistry,
  FormatHandler,
  LoadOptions,
  Image,
  Loader,
} from "@cytario/plugin-api";
import { assertApiCompatible, IncompatiblePluginError, sanitizeHeaders } from "@cytario/plugin-api";
```

Plugin authors export a default `CytarioPlugin`:

```ts
import type { CytarioPlugin } from "@cytario/plugin-api";
import { loadMyFormat } from "./loadMyFormat";

export default {
  name: "@vendor/my-format",
  apiVersion: "^1.0.0",
  register(ctx) {
    // `extension` accepts a string, a string[] of aliases, or a RegExp
    // tested against the URL. See the `FormatExtension` type export.
    ctx.formats.register(["myext", "myext.gz"], {
      load: (url, opts) => loadMyFormat(url, opts),
      fileTypeMeta: { label: "My Format", icon: "Microscope" },
    });
  },
} satisfies CytarioPlugin;
```

See `README.md` in the host repo for the plugin model — loading, compatibility gate, security boundary, lifecycle.

## Logging

`PluginContext.logger` is a structured logger. Each method takes a message string plus an optional `Record<string, unknown>` of fields — it is **not** a `console.log`-style varargs API. Arguments after the second are silently dropped.

```ts
// Correct
ctx.logger.info("opening file", { pluginName: "my-loader", url, sizeBytes });

// Wrong — varargs are not supported; "url" / "sizeBytes" never reach the host log
ctx.logger.info("opening file", url, sizeBytes);
```

Levels: `debug` / `info` / `warn` / `error`. The host wires each level to its own structured-log sink; field maps are JSON-stringified at sink time.

## License

AGPL-3.0 (same as `@cytario/web`).
