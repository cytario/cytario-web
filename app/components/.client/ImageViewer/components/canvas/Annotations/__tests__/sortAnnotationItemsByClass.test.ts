import { describe, expect, test } from "vitest";

import type { LayerTooltipItem } from "../../../../state/store/types";
import { sortAnnotationItemsByClass } from "../pickFeaturesAt";

const item = (cls: string, id: string): LayerTooltipItem => ({
  type: "Annotations",
  id,
  values: { [cls]: { value: "", color: [255, 0, 0] } },
});

describe("sortAnnotationItemsByClass", () => {
  test("groups interleaved classes together, case-insensitively", () => {
    const sorted = sortAnnotationItemsByClass([
      item("Unclassified", "0003"),
      item("Ipsum", "0001"),
      item("unclassified", "91b99fac"),
    ]);

    expect(sorted.map((i) => i.id)).toEqual(["0001", "0003", "91b99fac"]);
  });

  test("keeps z-order within a class (stable sort)", () => {
    const sorted = sortAnnotationItemsByClass([
      item("B", "top"),
      item("A", "a1"),
      item("B", "bottom"),
    ]);

    expect(sorted.map((i) => i.id)).toEqual(["a1", "top", "bottom"]);
  });
});
