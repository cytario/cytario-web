import { ByteDomain } from "../../state/types";
import { getDomain } from "../getDomain";

const testCases: [number[], ByteDomain][] = [
  [
    [0, 2, 3, 4, 23154],
    [0, 23154],
  ],
  [
    [2768, 3000, 4000, 5000, 6000, 7459],
    [2768, 7459],
  ],
];

describe("getDomain()", () => {
  test.each(testCases)("returns correct domain for array %j", (i, o) => {
    expect(getDomain(i)).toEqual(o);
  });
});
