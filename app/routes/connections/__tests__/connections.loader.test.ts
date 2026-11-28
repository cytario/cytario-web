import { createContext } from "react-router";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { type SessionData } from "~/.server/auth/sessionStorage";
import { loadConnections } from "~/routes/connections/connections.loader";
import mock from "~/utils/__tests__/__mocks__";
import type { LockedConnection } from "~/utils/lockedConnection";

vi.mock("~/.server/auth/authMiddleware", () => ({
  authContext: createContext<Partial<SessionData>>(),
  authMiddleware: vi.fn(async (_ctx, next) => next()),
}));

const { authContext } = await import("~/.server/auth/authMiddleware");

const publicProvider = {
  region: "eu-central-1",
  endpoint: null,
  allowsSharing: false,
  accessLevel: "read-only" as const,
  isPublic: true,
};

interface ContextOverrides {
  lockedConnections?: LockedConnection[];
  credentials?: Record<string, unknown>;
}

const buildContext = (overrides: ContextOverrides = {}) => ({
  get: vi.fn((ctx) => {
    if (ctx === authContext) {
      return {
        user: mock.user(),
        requestOrganization: "org1",
        connectionConfigs: [
          mock.connectionConfig({ id: "conn-a", name: "conn-a" }),
          mock.connectionConfig({ id: "conn-b", name: "conn-b" }),
        ],
        credentials: overrides.credentials ?? {},
        credentialErrors: {},
        connectionProviders: { "conn-a": publicProvider },
        lockedConnections: overrides.lockedConnections ?? [],
      };
    }
    return undefined;
  }),
});

const runLoader = (overrides: ContextOverrides = {}) =>
  loadConnections({ context: buildContext(overrides) as never } as never);

describe("connections loader — gate-locked presentation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("marks exactly the locked connections in the node list", async () => {
    const { nodes } = await runLoader({ lockedConnections: [{ id: "conn-b" }] });

    expect(nodes.map((node) => [node.connectionId, node.isLocked])).toEqual([
      ["conn-a", undefined],
      ["conn-b", true],
    ]);
  });

  test("an empty lock set leaves every node unlocked (absent, not false)", async () => {
    const { nodes } = await runLoader();

    expect(nodes.every((node) => !("isLocked" in node))).toBe(true);
  });

  test("a locked id naming no visible connection changes nothing", async () => {
    const { nodes } = await runLoader({ lockedConnections: [{ id: "conn-elsewhere" }] });

    expect(nodes.some((node) => node.isLocked)).toBe(false);
  });

  test("the full config list still ships so a locked row stays deletable", async () => {
    const { connectionConfigs, nodes } = await runLoader({
      lockedConnections: [{ id: "conn-a" }],
    });

    expect(connectionConfigs.map((config) => config.id)).toEqual(["conn-a", "conn-b"]);
    expect(nodes).toHaveLength(2);
  });

  test("the payload carries the gate's call to action for the row to render", async () => {
    const locked: LockedConnection[] = [
      {
        id: "conn-b",
        message: "Upgrade plan to browse private data.",
        resolveUrl: "https://admin.cytario.com/billing",
        resolveLabel: "Upgrade plan",
      },
    ];

    const { lockedConnections } = await runLoader({ lockedConnections: locked });

    expect(lockedConnections).toEqual(locked);
  });

  test("never ships a credential for a locked connection", async () => {
    const { credentials } = await runLoader({
      credentials: { "conn-a": mock.credentials(), "conn-b": mock.credentials() },
      lockedConnections: [{ id: "conn-b" }],
    });

    expect(Object.keys(credentials)).toEqual(["conn-a"]);
  });
});
