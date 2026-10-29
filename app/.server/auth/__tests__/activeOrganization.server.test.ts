import { UnknownOrganizationError, selectActiveOrganization } from "../activeOrganization.server";
import { withActiveOrganization } from "../getUserInfo";
import mock from "~/utils/__tests__/__mocks__";

vi.mock("../orgPreference.server", () => ({
  setPreferredOrg: vi.fn(),
}));

vi.mock("../sessionStorage", () => ({
  sessionStorage: {
    commitSession: vi.fn(async () => "session-cookie"),
  },
}));

const { setPreferredOrg } = await import("../orgPreference.server");

const multiOrgUser = () =>
  mock.user({
    sub: "user-1",
    organization: "alpha",
    organizations: {
      alpha: { groups: ["lab"], attributes: { tier: ["pro"] } },
      zeta: { groups: ["research", "research/admins"], attributes: {} },
    },
    groups: ["lab"],
    adminScopes: [],
  });

const makeSession = () => ({ set: vi.fn() });

describe("selectActiveOrganization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(setPreferredOrg).mockResolvedValue(undefined);
  });

  test("re-derives the projection for the new org", async () => {
    const session = makeSession();

    const result = await selectActiveOrganization(session as never, multiOrgUser(), "zeta");

    expect(result.user.organization).toBe("zeta");
    expect(result.user.groups).toEqual(["research"]);
    expect(result.user.adminScopes).toEqual(["research"]);
    expect(result.user.organizationAttributes).toEqual({});
  });

  test("writes the alias to the session and the preference", async () => {
    const session = makeSession();

    const result = await selectActiveOrganization(session as never, multiOrgUser(), "zeta");

    expect(session.set).toHaveBeenCalledWith("activeOrganization", "zeta");
    expect(session.set).toHaveBeenCalledWith(
      "user",
      expect.objectContaining({ organization: "zeta" }),
    );
    expect(setPreferredOrg).toHaveBeenCalledWith("user-1", "zeta");
    expect(result.setCookie).toBe("session-cookie");
  });

  test("rejects an alias the token does not carry", async () => {
    const session = makeSession();

    await expect(
      selectActiveOrganization(session as never, multiOrgUser(), "revoked"),
    ).rejects.toThrow(UnknownOrganizationError);
    expect(session.set).not.toHaveBeenCalled();
    expect(setPreferredOrg).not.toHaveBeenCalled();
  });

  test("a preference write failure does not fail the switch", async () => {
    vi.mocked(setPreferredOrg).mockRejectedValue(new Error("database unavailable"));
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const session = makeSession();

    const result = await selectActiveOrganization(session as never, multiOrgUser(), "zeta");

    expect(result.user.organization).toBe("zeta");
    consoleSpy.mockRestore();
  });

  test("switching back to the current org is a no-op projection", async () => {
    const user = multiOrgUser();

    const result = await selectActiveOrganization(makeSession() as never, user, "alpha");

    expect(result.user.organization).toBe("alpha");
    expect(result.user).toEqual(withActiveOrganization(user, "alpha"));
  });
});
