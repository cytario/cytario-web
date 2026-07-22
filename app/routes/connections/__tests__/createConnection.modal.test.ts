import { describe, expect, test } from "vitest";

import { resolveDefaultScope } from "../createConnection.modal";

describe("resolveDefaultScope", () => {
  test("returns exact match when scope is in adminScopes", () => {
    expect(resolveDefaultScope("cytario/Lab Services", ["cytario", "cytario/Lab Services"])).toBe(
      "cytario/Lab Services",
    );
  });

  test("returns covering parent when scope is a child of an adminScope", () => {
    expect(resolveDefaultScope("cytario/Lab Services", ["cytario"])).toBe("cytario");
  });

  test("prefers exact match over covering parent", () => {
    expect(resolveDefaultScope("cytario/Lab Services", ["cytario", "cytario/Lab Services"])).toBe(
      "cytario/Lab Services",
    );
  });

  test("returns first admin scope when no adminScope covers the scope param", () => {
    expect(resolveDefaultScope("delta/research", ["cytario"])).toBe("cytario");
  });

  test("returns first admin scope when scope param is null", () => {
    expect(resolveDefaultScope(null, ["cytario"])).toBe("cytario");
  });

  test("returns empty string when adminScopes is empty", () => {
    expect(resolveDefaultScope("cytario", [])).toBe("");
  });

  test("returns empty string when adminScopes is empty and scope param is null", () => {
    expect(resolveDefaultScope(null, [])).toBe("");
  });

  test("does not match partial segment names", () => {
    expect(resolveDefaultScope("cytario-labs", ["cytario"])).toBe("cytario");
  });
});
