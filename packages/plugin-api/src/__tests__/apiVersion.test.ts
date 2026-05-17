import { assertApiCompatible, IncompatiblePluginError } from "../apiVersion";

describe("assertApiCompatible", () => {
  test("does not throw for compatible plugin", () => {
    expect(() => assertApiCompatible({ name: "ok", apiVersion: "^1.0.0" }, "1.0.0")).not.toThrow();
  });

  test("throws IncompatiblePluginError for major mismatch", () => {
    expect(() => assertApiCompatible({ name: "old", apiVersion: "^2.0.0" }, "1.0.0")).toThrow(
      IncompatiblePluginError,
    );
  });

  test("throws for malformed apiVersion (does not surface TypeError)", () => {
    expect(() =>
      assertApiCompatible({ name: "weird", apiVersion: "not-a-version" }, "1.0.0"),
    ).toThrow(IncompatiblePluginError);
  });

  test("throws for missing name", () => {
    expect(() => assertApiCompatible({ apiVersion: "^1.0.0" }, "1.0.0")).toThrow(
      IncompatiblePluginError,
    );
  });

  test("throws for missing apiVersion", () => {
    expect(() => assertApiCompatible({ name: "x" }, "1.0.0")).toThrow(IncompatiblePluginError);
  });

  test("throws for non-string apiVersion", () => {
    expect(() => assertApiCompatible({ name: "x", apiVersion: 1 }, "1.0.0")).toThrow(
      IncompatiblePluginError,
    );
  });

  test("throws for null / undefined plugin", () => {
    expect(() => assertApiCompatible(null, "1.0.0")).toThrow(IncompatiblePluginError);
    expect(() => assertApiCompatible(undefined, "1.0.0")).toThrow(IncompatiblePluginError);
  });

  test("error message identifies plugin and mismatch", () => {
    try {
      assertApiCompatible({ name: "css", apiVersion: "^2.0.0" }, "1.0.0");
    } catch (err) {
      expect(err).toBeInstanceOf(IncompatiblePluginError);
      expect((err as Error).message).toContain("css");
      expect((err as Error).message).toContain("^2.0.0");
      expect((err as Error).message).toContain("1.0.0");
    }
  });
});
