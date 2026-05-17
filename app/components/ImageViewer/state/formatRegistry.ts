import type { FormatExtension, FormatHandler, FormatRegistry } from "@cytario/plugin-api";
import { getExtension } from "~/utils/fileType";

/**
 * Host-internal. `pluginName` is captured at register time so the public
 * `FormatRegistry` surface never accepts it from plugin code. `keys`
 * holds the normalized match keys for the registration — every key is
 * either a lowercase extension string (leading dot stripped) or a
 * `RegExp`. Resolution iterates registrations in insertion order and
 * tests the URL against each key.
 */
export interface Registration {
  keys: ReadonlyArray<string | RegExp>;
  handler: FormatHandler;
  pluginName: string;
}

export class UnknownFormatError extends Error {
  override readonly name = "UnknownFormatError";
}

export class DuplicateRegistrationError extends Error {
  override readonly name = "DuplicateRegistrationError";
}

function normalizeExtensionString(s: string): string {
  return s.toLowerCase().replace(/^\./, "");
}

function normalizeKeys(ext: FormatExtension): Array<string | RegExp> {
  if (typeof ext === "string") return [normalizeExtensionString(ext)];
  if (Array.isArray(ext)) return ext.map(normalizeExtensionString);
  return [ext];
}

function keyEquals(a: string | RegExp, b: string | RegExp): boolean {
  if (typeof a === "string" && typeof b === "string") return a === b;
  if (a instanceof RegExp && b instanceof RegExp) {
    return a.source === b.source && a.flags === b.flags;
  }
  return false;
}

function keysCollide(
  a: ReadonlyArray<string | RegExp>,
  b: ReadonlyArray<string | RegExp>,
): boolean {
  for (const ka of a) {
    for (const kb of b) {
      if (keyEquals(ka, kb)) return true;
    }
  }
  return false;
}

function describeKey(key: string | RegExp): string {
  return typeof key === "string" ? `"${key}"` : key.toString();
}

/**
 * Strip query string, fragment, and trailing slash before extracting an
 * extension. Directory-style URLs (`foo.ome.zarr/`) and signed URLs
 * (`foo.czi?sig=…`) must resolve to the same extension as their plain
 * counterparts. Regex keys see the original URL so they can match on
 * query parameters or trailing-slash semantics directly.
 */
function stripUrlSuffixAndSlash(url: string): string {
  const queryIdx = url.indexOf("?");
  const hashIdx = url.indexOf("#");
  let end = url.length;
  if (queryIdx !== -1) end = Math.min(end, queryIdx);
  if (hashIdx !== -1) end = Math.min(end, hashIdx);
  return url.slice(0, end).replace(/\/$/, "");
}

class FormatRegistryImpl {
  private readonly registrations: Registration[] = [];

  /**
   * Host-internal. Returns a `FormatRegistry` adapter bound to a plugin
   * name. Not exposed on the public `@cytario/plugin-api` surface, so
   * plugin code cannot register under another plugin's name.
   */
  scopedFor(pluginName: string): FormatRegistry {
    return {
      register: (extension, handler) => this.add(pluginName, extension, handler),
    };
  }

  /**
   * Host-internal registration. Same-plugin re-registration (same keys,
   * same plugin name) is a no-op so HMR re-runs do not throw.
   * Cross-plugin overlap on any key throws `DuplicateRegistrationError`.
   */
  add(pluginName: string, extension: FormatExtension, handler: FormatHandler): void {
    const keys = normalizeKeys(extension);
    const existing = this.registrations.find((r) => keysCollide(r.keys, keys));
    if (existing) {
      if (existing.pluginName === pluginName) return;
      throw new DuplicateRegistrationError(
        `Extension ${keys.map(describeKey).join(", ")} collides with ` +
          `registration owned by ${existing.pluginName}; ${pluginName} ` +
          `cannot reuse it.`,
      );
    }
    this.registrations.push({ keys, handler, pluginName });
  }

  /**
   * Resolve a URL to its registered handler. Iteration order is
   * insertion order; within a registration the first matching key wins.
   * String keys are tested against the URL's extension after stripping
   * the query string, fragment, and trailing slash. Regex keys are
   * tested against the unmodified URL.
   */
  resolve(url: string): Registration {
    const cleaned = stripUrlSuffixAndSlash(url);
    const extracted = getExtension(cleaned);
    for (const reg of this.registrations) {
      for (const key of reg.keys) {
        if (typeof key === "string") {
          if (extracted === key) return reg;
        } else if (key.test(url)) {
          return reg;
        }
      }
    }
    throw new UnknownFormatError(`No format handler registered for URL: ${url}`);
  }

  list(): readonly Registration[] {
    return this.registrations;
  }

  /** Test-only: drop all registrations. Not exposed via index re-export. */
  __reset(): void {
    this.registrations.length = 0;
  }
}

export const formatRegistry = new FormatRegistryImpl();

export type { FormatRegistryImpl };
