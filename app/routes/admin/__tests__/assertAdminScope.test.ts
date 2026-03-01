import { describe, expect, test } from "vitest";

import { assertAdminScope } from "../assertAdminScope";

describe("assertAdminScope", () => {
  test("returns scope and adminUrl when user has exact scope", () => {
    const result = assertAdminScope(
      "http://localhost/admin/users?scope=cytario",
      ["cytario"],
    );
    expect(result).toEqual({
      scope: "cytario",
      adminUrl: "/admin/users?scope=cytario",
    });
  });

  test("returns scope and adminUrl when user has parent scope", () => {
    const result = assertAdminScope(
      "http://localhost/admin/users?scope=cytario/lab",
      ["cytario"],
    );
    expect(result).toEqual({
      scope: "cytario/lab",
      adminUrl: "/admin/users?scope=cytario%2Flab",
    });
  });

  test("throws 400 when scope is missing", () => {
    expect(() =>
      assertAdminScope("http://localhost/admin/users", ["cytario"]),
    ).toThrow();

    try {
      assertAdminScope("http://localhost/admin/users", ["cytario"]);
    } catch (e) {
      expect(e).toBeInstanceOf(Response);
      expect((e as Response).status).toBe(400);
    }
  });

  test("throws 403 when user is not admin for scope", () => {
    try {
      assertAdminScope(
        "http://localhost/admin/users?scope=other-org",
        ["cytario"],
      );
    } catch (e) {
      expect(e).toBeInstanceOf(Response);
      expect((e as Response).status).toBe(403);
    }
  });

  test("does not match partial scope prefixes", () => {
    expect(() =>
      assertAdminScope(
        "http://localhost/admin/users?scope=cytario-extra",
        ["cytario"],
      ),
    ).toThrow();
  });

  test("encodes special characters in adminUrl", () => {
    const result = assertAdminScope(
      "http://localhost/admin/users?scope=cytario/team%20alpha",
      ["cytario"],
    );
    expect(result.adminUrl).toBe(
      "/admin/users?scope=cytario%2Fteam%20alpha",
    );
  });
});
