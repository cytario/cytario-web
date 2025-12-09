import { search } from "../search";

const testCases: [string, string, boolean][] = [
  ["test", "This is a Test string", true],
  ["missing", "This is a string", false],
  ["", "source", false],
  ["", "", false],
];

describe("search", () => {
  test.each(testCases)("Searching for %o in %o returns %o", (s, s2, b) => {
    expect(search(s, s2)).toBe(b);
  });
});
