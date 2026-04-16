import { describe, expect, test } from "vitest";

import { resolveDefaultScope } from "../createConnection.modal";

const USER_ID = "4cd912ea-5136-4b2d-8959-d5e983cbea05";

describe("resolveDefaultScope", () => {
  test("returns exact match when scope is in adminScopes", () => {
    expect(
      resolveDefaultScope("cytario/Lab Services", ["cytario", "cytario/Lab Services"], USER_ID),
    ).toBe("cytario/Lab Services");
  });

  test("returns covering parent when scope is a child of an adminScope", () => {
    expect(
      resolveDefaultScope("cytario/Lab Services", ["cytario"], USER_ID),
    ).toBe("cytario");
  });

  test("prefers exact match over covering parent", () => {
    expect(
      resolveDefaultScope("cytario/Lab Services", ["cytario", "cytario/Lab Services"], USER_ID),
    ).toBe("cytario/Lab Services");
  });

  test("returns userId when no adminScope covers the scope param", () => {
    expect(
      resolveDefaultScope("ultivue/research", ["cytario"], USER_ID),
    ).toBe(USER_ID);
  });

  test("returns userId when scope param is null", () => {
    expect(
      resolveDefaultScope(null, ["cytario"], USER_ID),
    ).toBe(USER_ID);
  });

  test("returns userId when adminScopes is empty", () => {
    expect(
      resolveDefaultScope("cytario", [], USER_ID),
    ).toBe(USER_ID);
  });

  test("does not match partial segment names", () => {
    // "cytario-labs" should NOT match adminScope "cytario"
    expect(
      resolveDefaultScope("cytario-labs", ["cytario"], USER_ID),
    ).toBe(USER_ID);
  });
});
