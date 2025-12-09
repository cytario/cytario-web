import { Loader } from "../../state/ome.tif.types";
import { getSelectionStats } from "../getSelectionStats";

const mockData = new Uint16Array(2 ** 16);
for (let i = 0; i < mockData.length; i++) {
  mockData[i] = i;
}
const mockLoader = {
  getRaster: vi.fn(
    () =>
      new Promise((resolve) =>
        resolve({ data: mockData, width: 1024, height: 1024 })
      )
  ),
} as unknown as Loader[number];

describe("getSelectionStats()", () => {
  test("returns correct stats for a full-range 16-bit ramp", async () => {
    expect(
      await getSelectionStats({
        loader: [mockLoader],
        selection: { c: 0, x: 0, y: 0, z: 0, t: 0 },
      })
    ).toEqual({
      domain: [0, 65535],
      contrastLimits: [45874, 65528],
      histogram: expect.any(Array),
    });
  });
});
