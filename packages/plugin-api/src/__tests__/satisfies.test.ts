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

  // Plugins declare the majors they support as an alternation (the same form
  // their package.json dependency range uses), so a plugin that touches no
  // removed member spans 6, 7 and 8 rather than being pinned to the newest.
  test("alternation admits a version from any alternative", () => {
    const range = "^6.0.0 || ^7.0.0 || ^8.0.0";
    expect(satisfies(range, "6.14.0")).toBe(true);
    expect(satisfies(range, "7.3.0")).toBe(true);
    expect(satisfies(range, "8.0.0")).toBe(true);
    expect(satisfies(range, "9.0.0")).toBe(false);
    expect(satisfies(range, "5.9.0")).toBe(false);
  });

  test("alternation tolerates spacing variants", () => {
    expect(satisfies("^6.0.0||^8.0.0", "8.0.0")).toBe(true);
    expect(satisfies("  ^6.0.0  ||  ^8.0.0  ", "6.0.0")).toBe(true);
  });

  test("an empty alternative cannot admit a version", () => {
    expect(satisfies("^6.0.0 ||", "8.0.0")).toBe(false);
    expect(satisfies("|| ^8.0.0", "6.5.0")).toBe(false);
  });
});
