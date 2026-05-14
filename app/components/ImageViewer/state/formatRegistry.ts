import type { FormatHandler, FormatRegistry } from "@cytario/plugin-api";
import { getExtension } from "~/utils/fileType";

/**
 * Host-internal. `pluginName` captured at register time so the public
 * `FormatRegistry` surface never accepts it from plugin code.
 */
export interface Registration {
  extension: string;
  handler: FormatHandler;
  pluginName: string;
}

export class UnknownFormatError extends Error {
  override readonly name = "UnknownFormatError";
}

export class DuplicateRegistrationError extends Error {
  override readonly name = "DuplicateRegistrationError";
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
   * Host-internal registration. Same-plugin re-registration is a no-op
   * (HMR-safe). Cross-plugin extension collision throws.
   */
  add(pluginName: string, extension: string, handler: FormatHandler): void {
    const ext = extension.toLowerCase().replace(/^\./, "");
    const existing = this.registrations.find((r) => r.extension === ext);
    if (existing) {
      if (existing.pluginName === pluginName) return;
      throw new DuplicateRegistrationError(
        `Extension "${ext}" already registered by ${existing.pluginName}; ${pluginName} cannot reuse it.`,
      );
    }
    this.registrations.push({ extension: ext, handler, pluginName });
  }

  /** match() first, extension lookup second, UnknownFormatError otherwise. */
  resolve(url: string): Registration {
    const byMatch = this.registrations.find((r) => r.handler.match?.(url) === true);
    if (byMatch) return byMatch;

    const ext = getExtension(url);
    if (ext !== undefined) {
      const byExt = this.registrations.find((r) => r.extension === ext);
      if (byExt) return byExt;
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
