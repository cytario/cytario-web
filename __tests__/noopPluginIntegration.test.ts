// Host-side integration test for @cytario/plugin-api: registry
// round-trip, auto-derived FILE_TYPE_REGISTRY entry, apiVersion gate.
import noopPlugin, { NOOP_SENTINEL } from "./fixtures/noop-plugin";
import { IncompatiblePluginError, assertApiCompatible } from "@cytario/plugin-api";
import { formatRegistry } from "~/components/ImageViewer/state/formatRegistry";
import { HOST_API_VERSION } from "~/lib/hostApiVersion";
import { getFileType, isImageFile } from "~/utils/fileType";

beforeEach(() => {
  formatRegistry.__reset();
});

describe("noop-plugin integration", () => {
  test("registers and resolves end-to-end via the scoped FormatRegistry", async () => {
    // Mirror what bootstrapPlugins does: build a scoped ctx, await register.
    assertApiCompatible(noopPlugin, HOST_API_VERSION);
    const ctx = {
      formats: formatRegistry.scopedFor(noopPlugin.name),
      gates: { register: () => {} },
      slots: { register: () => {} },
      contextMenus: { register: () => {} },
      sidebarNav: { register: () => {} },
      storagePicker: { get: () => null },
      routes: { register: () => {} },
      serverEndpoints: { register: () => {} },
      userMgmtGate: { register: () => {} },
      host: {
        connections: () => Promise.resolve([]),
        computeConnections: () => Promise.resolve([]),
        catalogConnections: () => Promise.resolve([]),
        connectionFetch: () => Promise.resolve(new Response()),
        objectStore: () => ({
          put: () => Promise.resolve(),
          get: () => Promise.resolve(new Response()),
          delete: () => Promise.resolve(),
          list: () => Promise.resolve([]),
        }),
        assumeComputeRole: () =>
          Promise.resolve({
            signedFetch: () => Promise.resolve(new Response()),
            jobQueueArn: "arn:aws:batch:eu-central-1:1:job-queue/q",
            jobRoleArn: "arn:aws:iam::1:role/job",
            executionRoleArn: "arn:aws:iam::1:role/exec",
            imagePullSecretRef: null,
            logGroupName: "/aws/batch/cytario-compute/test",
          }),
        revokeGrant: () => Promise.resolve(),
        exchangeToken: () =>
          Promise.resolve({ token: "", expiresAt: new Date(), offlineSessionId: "" }),
        jobLedger: () => ({
          record: () => Promise.resolve(),
          lookup: () => Promise.resolve(null),
          list: () => Promise.resolve([]),
          listAll: () => Promise.resolve([]),
          remove: () => Promise.resolve(),
        }),
      },
      env: "server" as const,
      logger: {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      },
    };
    await noopPlugin.register(ctx);

    const url = "https://x/sample.noop";
    const { handler, pluginName, keys } = formatRegistry.resolve(url);
    expect(pluginName).toBe("noop-plugin");
    expect(keys).toEqual(["noop"]);

    const result = await handler.load(url, {
      signedFetch: vi.fn(),
    });
    expect(result.metadata.Description).toBe(NOOP_SENTINEL);
  });

  test("auto-derives FILE_TYPE_REGISTRY entry from the plugin name and default icon", async () => {
    assertApiCompatible(noopPlugin, HOST_API_VERSION);
    await noopPlugin.register({
      formats: formatRegistry.scopedFor(noopPlugin.name),
      gates: { register: () => {} },
      slots: { register: () => {} },
      contextMenus: { register: () => {} },
      sidebarNav: { register: () => {} },
      storagePicker: { get: () => null },
      routes: { register: () => {} },
      serverEndpoints: { register: () => {} },
      userMgmtGate: { register: () => {} },
      host: {
        connections: () => Promise.resolve([]),
        computeConnections: () => Promise.resolve([]),
        catalogConnections: () => Promise.resolve([]),
        connectionFetch: () => Promise.resolve(new Response()),
        objectStore: () => ({
          put: () => Promise.resolve(),
          get: () => Promise.resolve(new Response()),
          delete: () => Promise.resolve(),
          list: () => Promise.resolve([]),
        }),
        assumeComputeRole: () =>
          Promise.resolve({
            signedFetch: () => Promise.resolve(new Response()),
            jobQueueArn: "arn:aws:batch:eu-central-1:1:job-queue/q",
            jobRoleArn: "arn:aws:iam::1:role/job",
            executionRoleArn: "arn:aws:iam::1:role/exec",
            imagePullSecretRef: null,
            logGroupName: "/aws/batch/cytario-compute/test",
          }),
        revokeGrant: () => Promise.resolve(),
        exchangeToken: () =>
          Promise.resolve({ token: "", expiresAt: new Date(), offlineSessionId: "" }),
        jobLedger: () => ({
          record: () => Promise.resolve(),
          lookup: () => Promise.resolve(null),
          list: () => Promise.resolve([]),
          listAll: () => Promise.resolve([]),
          remove: () => Promise.resolve(),
        }),
      },
      env: "server",
      logger: {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      },
    });

    expect(getFileType("anything.noop")).toBe("noop-plugin");
    expect(isImageFile("anything.noop")).toBe(true);
  });

  test("apiVersion gate rejects an incompatible plugin shape", () => {
    const incompatible = {
      ...noopPlugin,
      apiVersion: "^99.0.0",
    };
    expect(() => assertApiCompatible(incompatible, HOST_API_VERSION)).toThrow(
      IncompatiblePluginError,
    );
  });
});
