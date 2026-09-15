import { describe, expect, test } from "vitest";

import { buildRenderStack, type RenderStackElementConfig } from "../SpatialDataCanvas";

const element = (overrides: Partial<RenderStackElementConfig> = {}): RenderStackElementConfig => ({
  elementType: "image",
  elementKey: "blobs_image",
  isVisible: true,
  opacity: 1,
  ...overrides,
});

describe("buildRenderStack", () => {
  test("passes the selected z plane through channel selections for a z-bearing image", () => {
    const stack = buildRenderStack({
      "image:z_image": element({
        elementKey: "z_image",
        zIndex: 2,
        zSize: 5,
      }),
    });

    expect(stack.entries).toHaveLength(1);
    const entry = stack.entries[0];
    expect(entry).toMatchObject({
      kind: "spatial",
      id: "image:z_image",
      source: { elementType: "image", elementKey: "z_image" },
    });
    expect(entry.props).toEqual({
      opacity: 1,
      channels: { selections: [{ z: 2 }] },
    });
  });

  test("omits channel selections for 2D-only images", () => {
    const stack = buildRenderStack({
      "image:flat": element({ elementKey: "flat", zSize: 1 }),
      "image:unresolved": element({ elementKey: "unresolved" }),
    });

    expect(stack.entries).toHaveLength(2);
    for (const entry of stack.entries) {
      expect(entry.props).toEqual({ opacity: 1 });
      expect(entry.props).not.toHaveProperty("channels");
    }
  });

  test("passes z through for labels but not points", () => {
    const stack = buildRenderStack({
      "labels:z_labels": element({
        elementType: "labels",
        elementKey: "z_labels",
        zIndex: 1,
        zSize: 4,
      }),
      "points:transcripts": element({
        elementType: "points",
        elementKey: "transcripts",
        zIndex: 1,
        zSize: 4,
      }),
    });

    const byId = Object.fromEntries(stack.entries.map((e) => [e.id, e]));
    expect(byId["labels:z_labels"].props).toEqual({
      opacity: 1,
      channels: { selections: [{ z: 1 }] },
    });
    // Points z collapse is the library default; no selection is invented.
    expect(byId["points:transcripts"].props).toEqual({ opacity: 1 });
  });

  test("excludes hidden elements", () => {
    const stack = buildRenderStack({
      "image:hidden": element({ elementKey: "hidden", isVisible: false, zSize: 5 }),
    });

    expect(stack.entries).toHaveLength(0);
  });
});
