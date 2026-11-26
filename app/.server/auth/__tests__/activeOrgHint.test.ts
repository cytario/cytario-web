import { describe, expect, test } from "vitest";

import { activeOrgHintHeader, readActiveOrgHint } from "../activeOrgHint";

// webapp is unset in the test env, so the header carries no Domain attribute —
// the same shape localhost dev produces.
describe("activeOrgHint — shared cross-app cookie", () => {
  test("round-trips the alias through the serialized header", async () => {
    const header = await activeOrgHintHeader("acme");
    expect(header).toContain("cyt-active-org=");
    expect(header).toContain("HttpOnly");
    expect(header).toContain("SameSite=Lax");
    await expect(readActiveOrgHint(header)).resolves.toBe("acme");
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
