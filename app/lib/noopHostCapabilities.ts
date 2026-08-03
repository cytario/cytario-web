import type { HostCapabilities } from "@cytario/plugin-api";

/**
 * No-op sink for the client entry — every method rejects or throws because
 * host capabilities are server-only (SDS-CY-010097/010098/010099). A plugin
 * that captures `ctx.host` during `register(ctx)` on the client should never
 * call its methods — they are only valid inside server-side loaders/actions.
 *
 * Lives outside `.server/` so it can be imported by the client bootstrap
 * (`bootstrapPluginsCore.ts`) without violating the bundle boundary.
 */
export const noopHostCapabilities: HostCapabilities = {
  connections: () => Promise.reject(new Error("host capabilities are server-only")),
  computeConnections: () => Promise.reject(new Error("host capabilities are server-only")),
  catalogConnections: () => Promise.reject(new Error("host capabilities are server-only")),
  connectionFetch: () => Promise.reject(new Error("host capabilities are server-only")),
  objectStore: () => {
    throw new Error("host capabilities are server-only");
  },
  assumeComputeRole: () => Promise.reject(new Error("host capabilities are server-only")),
  exchangeToken: () => Promise.reject(new Error("host capabilities are server-only")),
  revokeGrant: () => Promise.reject(new Error("host capabilities are server-only")),
  jobLedger: () => {
    throw new Error("host capabilities are server-only");
  },
};
