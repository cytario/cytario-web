import { resolveScopeLabel } from "~/utils/scopeLabel";

describe("resolveScopeLabel", () => {
  test("substitutes the `*` sentinel with the organization identifier", () => {
    expect(resolveScopeLabel("*", "cytario")).toBe("cytario");
  });

  test("substitutes `*` inside a path", () => {
    expect(resolveScopeLabel("*/lab", "cytario")).toBe("cytario/lab");
  });

  test("passes through scopes that do not contain the sentinel", () => {
    expect(resolveScopeLabel("lab/team-x", "cytario")).toBe("lab/team-x");
  });

  test("returns the raw scope when no organization is supplied", () => {
    expect(resolveScopeLabel("*", undefined)).toBe("*");
    expect(resolveScopeLabel("*/admins", null)).toBe("*/admins");
  });

  test("only replaces full-segment matches of the sentinel", () => {
    expect(resolveScopeLabel("a*b", "cytario")).toBe("a*b");
  });
});
