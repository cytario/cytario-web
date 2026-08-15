import { describe, expect, test, vi } from "vitest";

import { consultUserMgmtGate } from "../userManagementGate";
import { userMgmtGateRegistry } from "../userManagementGateRegistry";
import type { Identity, UserManagementAction } from "@cytario/plugin-api";

const mockGetOrganizationMembers = vi.fn();
const mockFindOrganizationGroupByPath = vi.fn();
const mockGetOrganizationGroupMembers = vi.fn();

vi.mock("~/.server/auth/keycloakAdmin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/.server/auth/keycloakAdmin")>();
  return {
    ...actual,
    getOrganizationMembers: (...args: unknown[]) => mockGetOrganizationMembers(...args),
    findOrganizationGroupByPath: (...args: unknown[]) => mockFindOrganizationGroupByPath(...args),
    getOrganizationGroupMembers: (...args: unknown[]) => mockGetOrganizationGroupMembers(...args),
  };
});

const identity = (overrides?: Partial<Identity>): Identity => ({
  sub: "test-user",
  organization: "testcorp",
  organizationAttributes: {},
  groups: [],
  adminScopes: [],
  ...overrides,
});

const analystGroup = { id: "analyst-group-id", name: "analysts", path: "/analysts", subGroups: [] };

describe("consultUserMgmtGate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    userMgmtGateRegistry.__reset();
    mockGetOrganizationMembers.mockResolvedValue([{ id: "m1" }, { id: "m2" }, { id: "m3" }]);
    mockFindOrganizationGroupByPath.mockResolvedValue(analystGroup);
    mockGetOrganizationGroupMembers.mockResolvedValue([{ id: "a1" }, { id: "a2" }]);
  });

  test("short-circuits with no API calls when no gate is registered", async () => {
    await consultUserMgmtGate(identity(), "org-uuid", { kind: "invite", inviteCount: 1 });

    expect(mockGetOrganizationMembers).not.toHaveBeenCalled();
    expect(mockFindOrganizationGroupByPath).not.toHaveBeenCalled();
    expect(mockGetOrganizationGroupMembers).not.toHaveBeenCalled();
  });

  test("fetches counts and consults the gate when one is registered", async () => {
    const gate = vi.fn(() => ({ kind: "continue" }) as const);
    userMgmtGateRegistry.register(gate);

    const id = identity();
    const action: UserManagementAction = { kind: "invite", inviteCount: 2 };
    await consultUserMgmtGate(id, "org-uuid", action);

    expect(mockGetOrganizationMembers).toHaveBeenCalledWith("org-uuid");
    expect(mockFindOrganizationGroupByPath).toHaveBeenCalledWith("org-uuid", "analysts");
    expect(mockGetOrganizationGroupMembers).toHaveBeenCalledWith("org-uuid", "analyst-group-id");
    expect(gate).toHaveBeenCalledWith({
      identity: id,
      action,
      currentMemberCount: 3,
      currentAnalystCount: 2,
    });
  });

  test("reads the analyst group path from the analyst_group org attribute", async () => {
    const gate = vi.fn(() => ({ kind: "continue" }) as const);
    userMgmtGateRegistry.register(gate);

    await consultUserMgmtGate(
      identity({ organizationAttributes: { analyst_group: ["lab/analysts"] } }),
      "org-uuid",
      { kind: "addToGroup", groupPath: "lab/analysts", addCount: 1 },
    );

    expect(mockFindOrganizationGroupByPath).toHaveBeenCalledWith("org-uuid", "lab/analysts");
  });

  test("reports currentAnalystCount 0 when the analyst group is not found", async () => {
    mockFindOrganizationGroupByPath.mockResolvedValue(undefined);
    const gate = vi.fn(() => ({ kind: "continue" }) as const);
    userMgmtGateRegistry.register(gate);

    await consultUserMgmtGate(identity(), "org-uuid", { kind: "invite", inviteCount: 1 });

    expect(mockGetOrganizationGroupMembers).not.toHaveBeenCalled();
    expect(gate).toHaveBeenCalledWith(
      expect.objectContaining({ currentMemberCount: 3, currentAnalystCount: 0 }),
    );
  });

  test("resolves without throwing when the gate returns continue", async () => {
    userMgmtGateRegistry.register(() => ({ kind: "continue" }));

    await expect(
      consultUserMgmtGate(identity(), "org-uuid", { kind: "invite", inviteCount: 1 }),
    ).resolves.toBeUndefined();
  });

  test("throws a Response with default status 409 and message when the gate denies", async () => {
    userMgmtGateRegistry.register(() => ({ kind: "deny" }));

    try {
      await consultUserMgmtGate(identity(), "org-uuid", { kind: "invite", inviteCount: 1 });
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(Response);
      const res = e as Response;
      expect(res.status).toBe(409);
      expect(await res.text()).toBe("User-management action denied by gate.");
    }
  });

  test("throws a Response carrying the gate's custom status and message", async () => {
    userMgmtGateRegistry.register(() => ({ kind: "deny", status: 402, message: "no seats left" }));

    try {
      await consultUserMgmtGate(identity(), "org-uuid", { kind: "invite", inviteCount: 1 });
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(Response);
      const res = e as Response;
      expect(res.status).toBe(402);
      expect(await res.text()).toBe("no seats left");
    }
  });

  test("ignores a redirect outcome (resolves without throwing)", async () => {
    userMgmtGateRegistry.register(() => ({ kind: "redirect", url: "/upgrade" }));

    await expect(
      consultUserMgmtGate(identity(), "org-uuid", { kind: "invite", inviteCount: 1 }),
    ).resolves.toBeUndefined();
  });

  test("a throwing gate is fail-opened by the registry and the action proceeds", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    userMgmtGateRegistry.register(() => {
      throw new Error("gate boom");
    });

    await expect(
      consultUserMgmtGate(identity(), "org-uuid", { kind: "invite", inviteCount: 1 }),
    ).resolves.toBeUndefined();
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
