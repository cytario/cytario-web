import type { PickingInfo } from "@deck.gl/core";
import { describe, expect, test, vi } from "vitest";

import { pickFeaturesAt, type PickState } from "../pickFeaturesAt";
import type { AnnotationFeature } from "~/utils/db/getAnnotationsWasm";

const makeFeature = (id: string, className?: string): AnnotationFeature => ({
  type: "Feature",
  id,
  geometry: { type: "Point", coordinates: [0, 0] },
  properties: {
    ...(className ? { classification: { name: className, color: [255, 0, 0] } } : {}),
  },
});

const OWN_SET = "own-set-uuid";
const PEER_SET = "peer-set-uuid";

const makeState = (overrides: Partial<PickState> = {}): PickState => ({
  activeSetId: OWN_SET,
  annotationSets: [{ id: OWN_SET }, { id: PEER_SET }],
  annotationView: {},
  ...overrides,
});

const pick = (layerId: string, object?: unknown): PickingInfo =>
  ({ layer: { id: layerId }, object }) as unknown as PickingInfo;

const deck = (picks: PickingInfo[]) =>
  ({ pickMultipleObjects: vi.fn(() => picks) }) as unknown as import("@deck.gl/core").Deck;

describe("pickFeaturesAt", () => {
  test("routes channel picks by the channels id hint", () => {
    const routed = pickFeaturesAt(deck([pick("Tiled-Image-channels-7", {})]), 5, 5, makeState());
    expect(routed.channelPicks).toHaveLength(1);
    expect(routed.annotations).toHaveLength(0);
  });

  test("routes overlay picks by the overlay id prefix", () => {
    const routed = pickFeaturesAt(deck([pick("MarkersLayer-3", {})]), 5, 5, makeState());
    expect(routed.overlayPicks).toHaveLength(1);
  });

  test("resolves own-set annotations via the active set", () => {
    const feature = makeFeature("f1");
    const routed = pickFeaturesAt(
      deck([pick("annotations-0-polygons-fill", feature)]),
      5,
      5,
      makeState(),
    );
    expect(routed.annotations).toEqual([{ feature, setId: OWN_SET, pick: expect.anything() }]);
  });

  test("resolves peer-set annotations by the set id in the layer id", () => {
    const feature = makeFeature("f2");
    const routed = pickFeaturesAt(
      deck([pick(`annotations-0-peer-${PEER_SET}-polygons-fill`, feature)]),
      5,
      5,
      makeState(),
    );
    expect(routed.annotations[0]?.setId).toBe(PEER_SET);
  });

  test("dedupes the same feature reported by fill and stroke sublayers", () => {
    const feature = makeFeature("f1");
    const routed = pickFeaturesAt(
      deck([
        pick("annotations-0-polygons-fill", feature),
        pick("annotations-0-polygons-stroke", feature),
      ]),
      5,
      5,
      makeState(),
    );
    expect(routed.annotations).toHaveLength(1);
  });

  test("skips selection-halo layers", () => {
    const feature = makeFeature("f1");
    const routed = pickFeaturesAt(
      deck([pick(`annotations-0-selection-${OWN_SET}-0`, feature)]),
      5,
      5,
      makeState(),
    );
    expect(routed.annotations).toHaveLength(0);
  });

  test("filters hidden classes per the feature's own set — a peer's hidden class must not hide an own-set feature", () => {
    const own = makeFeature("f1", "Tumor");
    const routed = pickFeaturesAt(
      deck([pick("annotations-0-polygons-fill", own)]),
      5,
      5,
      makeState({
        annotationView: { [PEER_SET]: { hiddenClasses: ["Tumor"] } },
      }),
    );
    expect(routed.annotations).toHaveLength(1);

    const hiddenOwn = pickFeaturesAt(
      deck([pick("annotations-0-polygons-fill", own)]),
      5,
      5,
      makeState({
        annotationView: { [OWN_SET]: { hiddenClasses: ["Tumor"] } },
      }),
    );
    expect(hiddenOwn.annotations).toHaveLength(0);
  });

  test("no picks route to empty arrays", () => {
    const routed = pickFeaturesAt(deck([]), 5, 5, makeState());
    expect(routed.picks).toHaveLength(0);
    expect(routed.channelPicks).toHaveLength(0);
    expect(routed.overlayPicks).toHaveLength(0);
    expect(routed.annotations).toHaveLength(0);
  });
});
