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

  test("caret pins the left-most non-zero digit, so 0.x is narrower", () => {
    expect(satisfies("^0.1.2", "0.1.9")).toBe(true);
    expect(satisfies("^0.1.2", "0.2.0")).toBe(false);
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

  test("a prerelease version is not admitted by the released range", () => {
    expect(satisfies("^1.0.0", "1.0.0-rc.1")).toBe(false);
  });

  test("a prerelease range admits the release it precedes", () => {
    expect(satisfies("^1.0.0-rc.1", "1.0.0-rc.2")).toBe(true);
    expect(satisfies("^1.0.0-rc.1", "1.0.0")).toBe(true);
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

  test("accepts the npm range forms a plugin author may reasonably write", () => {
    expect(satisfies(">=6 <9", "8.0.0")).toBe(true);
    expect(satisfies(">=6 <9", "9.0.0")).toBe(false);
    expect(satisfies("~6.1", "6.1.5")).toBe(true);
    expect(satisfies("6.x", "6.4.0")).toBe(true);
    expect(satisfies("^6", "6.14.0")).toBe(true);
  });

  test("an empty alternative cannot admit a version", () => {
    expect(satisfies("^6.0.0 ||", "8.0.0")).toBe(false);
    expect(satisfies("|| ^8.0.0", "6.5.0")).toBe(false);
  });

  // `semver` reads these as "any version", which on a compatibility gate would
  // let a plugin that declared nothing usable load on a host it never targeted.
  test("a range that means 'any version' is refused, not admitted", () => {
    expect(satisfies("*", "1.0.0")).toBe(false);
    expect(satisfies("", "1.0.0")).toBe(false);
    expect(satisfies("*", "99.0.0")).toBe(false);
  });

  test("rejects malformed input without throwing", () => {
    expect(satisfies("not-a-version", "1.0.0")).toBe(false);
    expect(satisfies("^1.0.0 | ^8.0.0", "1.0.0")).toBe(false);
    expect(satisfies("^1.0.0,^8.0.0", "1.0.0")).toBe(false);
    expect(satisfies("^1.0.0", "")).toBe(false);
    expect(satisfies("^1.0.0", "not-a-version")).toBe(false);
  });

  test("rejects operator in version argument", () => {
    expect(satisfies("^1.0.0", "^1.0.0")).toBe(false);
  });
});
