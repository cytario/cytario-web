import { describe, expect, test, vi } from "vitest";

process.env.ACTIVE_ORG_COOKIE_DOMAIN ??= "cytario.com";

const { activeOrgHintHeader, pickDefaultOrganization, readActiveOrgHint } =
  await import("../activeOrgHint");

describe("activeOrgHint — shared cross-app cookie", () => {
  test("round-trips the alias through the serialized header", async () => {
    const header = await activeOrgHintHeader("acme");
    expect(header).toContain("cyt-active-org=");
    expect(header).toContain("Domain=cytario.com");
    expect(header).toContain("HttpOnly");
    expect(header).toContain("SameSite=Lax");
    await expect(readActiveOrgHint(header)).resolves.toBe("acme");
  });

  test("an unset shared domain omits the Domain attribute (host-only cookie)", async () => {
    process.env.ACTIVE_ORG_COOKIE_DOMAIN = "";
    vi.resetModules();
    const { activeOrgHintHeader: header } = await import("../activeOrgHint");
    expect(await header("acme")).not.toContain("Domain=");
    process.env.ACTIVE_ORG_COOKIE_DOMAIN = "cytario.com";
    vi.resetModules();
  });

  test("absent cookie reads as undefined", async () => {
    await expect(readActiveOrgHint(null)).resolves.toBeUndefined();
  });

  test("an empty value reads as undefined", async () => {
    await expect(readActiveOrgHint("cyt-active-org=")).resolves.toBeUndefined();
  });

  test("a foreign cookie jar without the hint reads as undefined", async () => {
    await expect(readActiveOrgHint("other=a; second=b")).resolves.toBeUndefined();
  });

  test("the hint survives alongside a foreign cookie jar", async () => {
    const header = await activeOrgHintHeader("zeta");
    await expect(readActiveOrgHint(`other=a; ${header}; third=c`)).resolves.toBe("zeta");
  });
});

describe("defaultOrganization — hint vs persisted preference", () => {
  const orgs = { acme: { groups: [], attributes: {} }, zeta: { groups: [], attributes: {} } };

  test("a hint the token carries wins over the persisted preference", () => {
    expect(pickDefaultOrganization(orgs, "zeta", "acme")).toBe("zeta");
  });

  test("a hint naming a membership the user left falls back to the persisted preference", () => {
    expect(pickDefaultOrganization(orgs, "gone", "acme")).toBe("acme");
  });

  test("no hint and no preference resolves the first alias", () => {
    expect(pickDefaultOrganization(orgs, undefined, null)).toBe("acme");
  });
});
