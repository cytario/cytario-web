import { describe, expect, it } from "vitest";

import { invalidateOverlayTiles } from "../../../utils/sharedTileCache";
import { createViewerStore } from "../createViewerStore";
import type { OverlaysState, OverlayState } from "../types";
import { viewerStoreMigrate } from "../viewerStore.persistence";
import type { OverlayConfig } from "~/utils/db/overlayConfig";

vi.mock("../../../utils/sharedTileCache", () => ({
  invalidateOverlayTiles: vi.fn(),
}));

const makeEntry = (overlays: OverlaysState) => ({
  id: crypto.randomUUID(),
  author: "user-a",
  channels: {},
  overlays,
  channelsOpacity: 1,
  overlaysFillOpacity: 0.8,
  showCellOutline: true,
  annotationsOpacity: 1,
  showAnnotationOutline: true,
  isChannelsLoading: 0,
  isOverlaysLoading: 0,
});

describe("viewerStoreMigrate v5 → v6 (overlay entry shape)", () => {
  it("wraps legacy bare marker records into { markers, config: null }", () => {
    const v5State = {
      currentUserId: "user-a",
      imagePanelIndex: 0,
      imagePanels: [0],
      layersStates: [
        {
          ...makeEntry({} as OverlaysState),
          overlays: {
            "res-1": {
              marker_positive_cd4: { color: [1, 2, 3, 255], count: 4, isVisible: true },
            },
          },
        },
      ],
    };

    const migrated = viewerStoreMigrate(v5State, 5);
    const overlays = migrated.layersStates[0]?.overlays as unknown as OverlaysState;
    expect(overlays["res-1"]).toEqual({
      markers: {
        marker_positive_cd4: { color: [1, 2, 3, 255], count: 4, isVisible: true },
      },
      config: null,
    });
  });

  it("keeps new-shape entries intact", () => {
    const entry = {
      markers: { m1: { color: [9, 9, 9, 255], count: 1, isVisible: false } },
      config: {
        version: 1,
        columns: { id: "object", geometry: "geom", x: "x", y: "y" },
        classes: [{ sourceColumn: "m1", label: "one", mode: "boolean" }],
      },
    };
    const v5State = {
      currentUserId: "user-a",
      imagePanelIndex: 0,
      imagePanels: [0],
      layersStates: [{ ...makeEntry({} as OverlaysState), overlays: { "res-1": entry } }],
    };

    const migrated = viewerStoreMigrate(v5State, 5);
    expect((migrated.layersStates[0]?.overlays as unknown as OverlaysState)["res-1"]).toEqual(
      entry,
    );
  });

  it("drops unparseable overlay values", () => {
    const v5State = {
      currentUserId: "user-a",
      imagePanelIndex: 0,
      imagePanels: [0],
      layersStates: [{ ...makeEntry({} as OverlaysState), overlays: { bad: 17, ok: { m: 1 } } }],
    };

    const migrated = viewerStoreMigrate(v5State, 5);
    const overlays = migrated.layersStates[0]?.overlays as unknown as Record<string, unknown>;
    expect(overlays["bad"]).toBeUndefined();
    expect(overlays["ok"]).toEqual({ markers: { m: 1 }, config: null });
  });
});

describe("updateOverlayConfig", () => {
  it("replaces the entry's config and markers in place", () => {
    const store = createViewerStore("overlay-config-store");
    store.setState({
      imagePanelIndex: 0,
      imagePanels: [0],
      layersStates: [
        makeEntry({
          "res-1": {
            markers: { old: { color: [1, 1, 1, 255], count: 0, isVisible: false } },
            config: null,
          },
        }),
      ],
    });

    const nextConfig: OverlayConfig = {
      version: 1,
      columns: { id: "object", geometry: "geom", x: "x", y: "y" },
      classes: [{ sourceColumn: "cd8", label: "CD8", mode: "boolean" }],
    };
    const nextMarkers: OverlayState = {
      cd8: { color: [2, 2, 2, 255], count: 12, isVisible: false, label: "CD8" },
    };

    store.getState().updateOverlayConfig("res-1", nextConfig, nextMarkers);

    const entry = store.getState().layersStates[0].overlays["res-1"];
    expect(entry.config).toEqual(nextConfig);
    expect(entry.markers).toEqual(nextMarkers);
  });

  it("is a no-op for an unknown resource", () => {
    const store = createViewerStore("overlay-config-store-2");
    store.setState({
      imagePanelIndex: 0,
      imagePanels: [0],
      layersStates: [makeEntry({})],
    });

    const before = store.getState().layersStates[0].overlays;
    store.getState().updateOverlayConfig("missing", null, {});
    expect(store.getState().layersStates[0].overlays).toBe(before);
  });
});

describe("applyOverlayReconfiguration", () => {
  it("invalidates tiles and re-arms error reporting for the resource", async () => {
    const { applyOverlayReconfiguration } = await import("../slices/viewer.overlays.store");
    const { shouldReportOverlayError } = await import("~/utils/db/overlayErrorOnce");

    shouldReportOverlayError("res-1", "cfg");
    applyOverlayReconfiguration("res-1");
    expect(invalidateOverlayTiles).toHaveBeenCalledWith("res-1");
    // re-armed: the same config now reports again
    expect(shouldReportOverlayError("res-1", "cfg")).toBe(true);
  });
});
