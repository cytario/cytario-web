import { satisfies } from "../satisfies";

describe("satisfies", () => {
  test("caret accepts in-major upgrades", () => {
    expect(satisfies("^1.0.0", "1.0.0")).toBe(true);
    expect(satisfies("^1.0.0", "1.2.3")).toBe(true);
    expect(satisfies("^1.0.0", "1.99.99")).toBe(true);
  });

  test("caret rejects major bumps", () => {
    expect(satisfies("^1.0.0", "2.0.0")).toBe(false);
    expect(satisfies("^1.0.0", "0.9.9")).toBe(false);
  });

  test("caret rejects below the floor", () => {
    expect(satisfies("^1.2.0", "1.1.9")).toBe(false);
    expect(satisfies("^1.2.0", "1.2.0")).toBe(true);
  });

  test("tilde accepts patch upgrades only", () => {
    expect(satisfies("~1.0.0", "1.0.0")).toBe(true);
    expect(satisfies("~1.0.0", "1.0.99")).toBe(true);
    expect(satisfies("~1.0.0", "1.1.0")).toBe(false);
  });

  test("exact requires triple match", () => {
    expect(satisfies("1.0.0", "1.0.0")).toBe(true);
    expect(satisfies("1.0.0", "1.0.1")).toBe(false);
  });

  test("rejects prereleases (treated as malformed)", () => {
    expect(satisfies("^1.0.0", "1.0.0-rc.1")).toBe(false);
    expect(satisfies("^1.0.0-rc.1", "1.0.0")).toBe(false);
  });

  test("rejects star, empty, and malformed input", () => {
    expect(satisfies("*", "1.0.0")).toBe(false);
    expect(satisfies("", "1.0.0")).toBe(false);
    expect(satisfies("not-a-version", "1.0.0")).toBe(false);
    expect(satisfies("^1.0.0", "")).toBe(false);
    expect(satisfies("^1.0.0", "not-a-version")).toBe(false);
  });

  test("rejects operator in version argument", () => {
    expect(satisfies("^1.0.0", "^1.0.0")).toBe(false);
  });
});
