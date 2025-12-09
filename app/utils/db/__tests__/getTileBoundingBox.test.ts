import { getTileBoundingBox } from "../getTileBoundingBox";

describe("getTileBoundingBox", () => {
  test("returns correct bounding box for z=0, x=0, y=0", () => {
    const bbox = getTileBoundingBox({ z: 0, x: 0, y: 0 });
    expect(bbox).toEqual([0, 0, 512, 512]);
  });
});
