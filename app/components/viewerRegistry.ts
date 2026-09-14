import type { SignedFetch, ViewerContribution, ViewerRegistry } from "@cytario/plugin-api";

interface ViewerEntry {
  pluginName: string;
  contribution: ViewerContribution;
}

/**
 * Client viewer registry: multi-owner module singleton. `scopedFor(pluginName)`
 * binds the plugin name at register time (mirrors `slotRegistry`); `register`
 * appends (no collision detection). Resolution walks registrations in order:
 * a sync `match` hit wins immediately; otherwise each contribution's optional
 * `canHandle` is awaited in the same order and the first true wins — a
 * rejection or false falls through to the next.
 */
class ViewerRegistryImpl {
  private readonly entries: ViewerEntry[] = [];

  /** Host-internal: a `ViewerRegistry` adapter bound to a plugin name. */
  scopedFor(pluginName: string): ViewerRegistry {
    return {
      register: (contribution) => this.add(pluginName, contribution),
    };
  }

  add(pluginName: string, contribution: ViewerContribution): void {
    // Fail here, not at render/dispatch — a non-callable would throw deep
    // inside React or the route's dispatch.
    if (typeof contribution.match !== "function") {
      throw new TypeError(
        `Plugin "${pluginName}" registered a viewer with a non-function match (got ${typeof contribution.match})`,
      );
    }
    if (typeof contribution.component !== "function") {
      throw new TypeError(
        `Plugin "${pluginName}" registered a non-component viewer (got ${typeof contribution.component})`,
      );
    }
    if (contribution.canHandle !== undefined && typeof contribution.canHandle !== "function") {
      throw new TypeError(
        `Plugin "${pluginName}" registered a non-function canHandle (got ${typeof contribution.canHandle})`,
      );
    }
    this.entries.push({ pluginName, contribution });
  }

  /** First contribution whose sync `match` claims the resource, in registration order. */
  resolve(resourceId: string): ViewerContribution | null {
    for (const { contribution } of this.entries) {
      if (contribution.match(resourceId)) return contribution;
    }
    return null;
  }

  /**
   * Async resolution after no sync `match` claimed the resource: awaits each
   * contribution's `canHandle` in registration order; the first that resolves
   * true wins. Contributions without `canHandle` are skipped. A rejected
   * `canHandle` counts as false, never propagates.
   */
  async resolveAsync(
    resourceId: string,
    httpsUrl: string,
    signedFetch: SignedFetch,
  ): Promise<ViewerContribution | null> {
    for (const { contribution } of this.entries) {
      if (!contribution.canHandle) continue;
      let capable = false;
      try {
        capable = await contribution.canHandle(resourceId, httpsUrl, signedFetch);
      } catch {
        capable = false;
      }
      if (capable) return contribution;
    }
    return null;
  }

  /** True when no plugin has registered a viewer. */
  isEmpty(): boolean {
    return this.entries.length === 0;
  }

  /** True when any contribution offers a canHandle sniff. */
  hasAsync(): boolean {
    return this.entries.some((e) => e.contribution.canHandle !== undefined);
  }

  /** Test-only: drop all registrations. */
  __reset(): void {
    this.entries.length = 0;
  }
}

export const viewerRegistry = new ViewerRegistryImpl();

export type { ViewerRegistryImpl };
