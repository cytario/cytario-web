import type { HostCapabilities } from "@cytario/plugin-api";

// Every method rejects or throws: host capabilities are server-only and only
// valid inside server-side loaders/actions. Lives outside `.server/` so the
// client bootstrap can import it without violating the bundle boundary.
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
  keepAliveGrant: () => Promise.reject(new Error("host capabilities are server-only")),
  brokerPublicUrl: () => {
    throw new Error("host capabilities are server-only");
  },
  jobLedger: () => {
    throw new Error("host capabilities are server-only");
  },
};
