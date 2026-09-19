import type { FormatExtension, FormatHandler, FormatRegistry } from "@cytario/plugin-api";
import { getExtension, __resetFileTypeCache } from "~/utils/fileType";

/** Keys are normalized (lowercase extensions, leading dot stripped) or RegExp; resolution tests them in insertion order. */
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

/** Directory-style and signed URLs must resolve to the same extension as their plain counterparts; regex keys see the raw URL. */
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

  /** Host-internal: binds pluginName here so plugins cannot register under another name. */
  scopedFor(pluginName: string): FormatRegistry {
    return {
      register: (extension, handler) => this.add(pluginName, extension, handler),
    };
  }

  /** Same-plugin re-registration is a no-op so HMR re-runs do not throw. */
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
    __resetFileTypeCache();
  }

  /** String keys match the stripped extension; regex keys match the raw URL. */
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

  /** Test-only; also clears the fileType cache. */
  __reset(): void {
    this.registrations.length = 0;
    __resetFileTypeCache();
  }
}

export const formatRegistry = new FormatRegistryImpl();

export type { FormatRegistryImpl };
