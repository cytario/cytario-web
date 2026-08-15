import * as api from "../index";
import type { CytarioPlugin, PluginContext } from "../index";

describe("public surface", () => {
  test("exports expected runtime helpers", () => {
    expect(typeof api.assertApiCompatible).toBe("function");
    expect(typeof api.sanitizeHeaders).toBe("function");
    expect(typeof api.satisfies).toBe("function");
    expect(api.IncompatiblePluginError).toBeDefined();
  });

  test("CytarioPlugin can be satisfied by a literal", () => {
    const plugin = {
      name: "noop",
      apiVersion: "^1.0.0",
      register(ctx: PluginContext) {
        ctx.formats.register("noop", {
          load: async () => ({
            data: [],
            metadata: {
              Pixels: {
                Type: "Uint8",
                Channels: [],
                SizeX: 0,
                SizeY: 0,
                PhysicalSizeXUnit: "",
                PhysicalSizeYUnit: "",
                PhysicalSizeZUnit: "",
              },
            },
          }),
        });
      },
    } satisfies CytarioPlugin;
    expect(plugin.name).toBe("noop");
  });

  test("CytarioPlugin can register a context-menu entry via ctx.contextMenus", () => {
    const calls: Array<{ target: string; entryId: string }> = [];
    const plugin = {
      name: "context-menu-probe",
      apiVersion: "^4.1.0",
      register(ctx: PluginContext) {
        ctx.contextMenus.register("s3-node", {
          id: "analyze",
          label: "Analyze…",
          icon: "Microscope",
          async isHidden() {
            return false;
          },
          onActivate() {
            calls.push({ target: "s3-node", entryId: "analyze" });
          },
        });
      },
    } satisfies CytarioPlugin;
    plugin.register({
      contextMenus: {
        register: (target, entry) => calls.push({ target, entryId: entry.id }),
      },
      sidebarNav: { register: () => {} },
      storagePicker: { get: () => null },
      formats: { register: () => {} } as never,
      gates: { register: () => {} },
      slots: { register: () => {} },
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
      logger: console,
      env: "client",
    });
    expect(calls).toEqual([{ target: "s3-node", entryId: "analyze" }]);
  });

  test("CytarioPlugin can register a sidebar-nav entry via ctx.sidebarNav", () => {
    const calls: Array<{ target: string; entryId: string; to: string }> = [];
    const plugin = {
      name: "sidebar-nav-probe",
      apiVersion: "^4.1.0",
      register(ctx: PluginContext) {
        ctx.sidebarNav.register("nav", {
          id: "jobs",
          label: "Jobs",
          icon: "Microscope",
          to: "/jobs",
          async isHidden() {
            return false;
          },
          onActivate() {
            calls.push({ target: "nav", entryId: "jobs", to: "/jobs" });
          },
        });
      },
    } satisfies CytarioPlugin;
    plugin.register({
      sidebarNav: {
        register: (target, entry) => calls.push({ target, entryId: entry.id, to: entry.to }),
      },
      contextMenus: { register: () => {} },
      formats: { register: () => {} } as never,
      gates: { register: () => {} },
      slots: { register: () => {} },
      routes: { register: () => {} },
      serverEndpoints: { register: () => {} },
      storagePicker: { get: () => null },
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
      logger: console,
      env: "client",
    });
    expect(calls).toEqual([{ target: "nav", entryId: "jobs", to: "/jobs" }]);
  });

  test("CytarioPlugin can register a route contribution via ctx.routes", () => {
    const calls: Array<{ path: string }> = [];
    const plugin = {
      name: "route-probe",
      apiVersion: "^4.1.0",
      register(ctx: PluginContext) {
        ctx.routes.register({
          path: "/jobs",
          element: () => null,
          loader: async ({ identity }) => Response.json({ org: identity?.organization }),
        });
      },
    } satisfies CytarioPlugin;
    plugin.register({
      routes: {
        register: (contribution) => calls.push({ path: contribution.path }),
      },
      sidebarNav: { register: () => {} },
      storagePicker: { get: () => null },
      contextMenus: { register: () => {} },
      formats: { register: () => {} } as never,
      gates: { register: () => {} },
      slots: { register: () => {} },
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
      logger: console,
      env: "server",
    });
    expect(calls).toEqual([{ path: "/jobs" }]);
  });

  test("CytarioPlugin can register a server endpoint via ctx.serverEndpoints", () => {
    const calls: Array<{ path: string; auth: string }> = [];
    const plugin = {
      name: "endpoint-probe",
      apiVersion: "^4.1.0",
      register(ctx: PluginContext) {
        ctx.serverEndpoints.register({
          path: "/api/plugin/catalog",
          auth: "session",
          loader: async () => Response.json({ ok: true }),
        });
      },
    } satisfies CytarioPlugin;
    plugin.register({
      serverEndpoints: {
        register: (c) => calls.push({ path: c.path, auth: c.auth }),
      },
      routes: { register: () => {} },
      sidebarNav: { register: () => {} },
      storagePicker: { get: () => null },
      contextMenus: { register: () => {} },
      formats: { register: () => {} } as never,
      gates: { register: () => {} },
      slots: { register: () => {} },
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
      logger: console,
      env: "server",
    });
    expect(calls).toEqual([{ path: "/api/plugin/catalog", auth: "session" }]);
  });
});
