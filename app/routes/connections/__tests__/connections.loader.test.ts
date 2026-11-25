import { createContext } from "react-router";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { type SessionData } from "~/.server/auth/sessionStorage";
import { loadConnections } from "~/routes/connections/connections.loader";
import mock from "~/utils/__tests__/__mocks__";

vi.mock("~/.server/auth/authMiddleware", () => ({
  authContext: createContext<Partial<SessionData>>(),
  authMiddleware: vi.fn(async (_ctx, next) => next()),
}));

const { authContext } = await import("~/.server/auth/authMiddleware");

const buildContext = (lockedConnectionIds: string[] = []) => ({
  get: vi.fn((ctx) => {
    if (ctx === authContext) {
      return {
        connectionConfigs: [
          mock.connectionConfig({ id: "conn-a", name: "conn-a" }),
          mock.connectionConfig({ id: "conn-b", name: "conn-b" }),
        ],
        credentials: {},
        credentialErrors: {},
        lockedConnectionIds,
      };
    }
    return undefined;
  }),
});

const runLoader = (lockedConnectionIds: string[] = []) =>
  loadConnections({ context: buildContext(lockedConnectionIds) as never } as never);

describe("connections loader — gate-locked presentation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("marks exactly the locked connections in the node list", async () => {
    const { nodes } = await runLoader(["conn-b"]);

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
    const { nodes } = await runLoader(["conn-elsewhere"]);

    expect(nodes.some((node) => node.isLocked)).toBe(false);
  });

  test("the full config list still ships so a locked row stays deletable", async () => {
    const { connectionConfigs, nodes } = await runLoader(["conn-a"]);

    expect(connectionConfigs.map((config) => config.id)).toEqual(["conn-a", "conn-b"]);
    expect(nodes).toHaveLength(2);
  });
});
