import { decodeViewState, encodeViewState } from "../viewStateUrl";

describe("encodeViewState()", () => {
  test("rounds zoom to 3 decimals and target to integers", () => {
    expect(encodeViewState({ zoom: -1.234567, target: [1234.7, 5678.2] })).toBe("-1.235,1235,5678");
  });

  test("drops trailing zeros from zoom", () => {
    expect(encodeViewState({ zoom: 2, target: [0, 0] })).toBe("2,0,0");
  });
});

describe("decodeViewState()", () => {
  test("parses a well-formed string", () => {
    expect(decodeViewState("-1.235,1235,5678")).toEqual({
      zoom: -1.235,
      target: [1235, 5678],
    });
  });

  test.each([null, "", "1,2", "1,2,3,4", "a,2,3", "1,b,3", "1,2,c", "Infinity,2,3"])(
    "returns null for malformed input %j",
    (raw) => {
      expect(decodeViewState(raw)).toBeNull();
    },
  );

  test("round-trips through encode", () => {
    const vs = { zoom: -3.142, target: [4096, 2048] as [number, number] };
    const decoded = decodeViewState(encodeViewState(vs));
    expect(decoded).toEqual(vs);
  });
});
