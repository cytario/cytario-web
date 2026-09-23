import {
  layersStateToSidecarEntry,
  migrateSidecarOverlays,
  sidecarEntryToLayersState,
  viewSettingsDocumentSchema,
} from "../viewSettingsSchema";
import type { LayersStateEntry } from "~/components/.client/ImageViewer/state/store/types";
import { DEFAULT_OVERLAYS_FILL_OPACITY } from "~/utils/overlayDefaults";

const overlayEntry = {
  markers: {
    marker_positive_cd4: { color: [255, 0, 0, 255], count: 3, isVisible: true, label: "cd4" },
  },
  config: {
    version: 1,
    columns: { id: "object", geometry: "geom", x: "x", y: "y" },
    classes: [{ sourceColumn: "marker_positive_cd4", label: "cd4", mode: "boolean" }],
  },
};

describe("migrateSidecarOverlays", () => {
  test("passes through new-shape entries unchanged", () => {
    const result = migrateSidecarOverlays({ "res-1": overlayEntry });
    expect(result["res-1"]).toEqual(overlayEntry);
  });

  test("wraps legacy bare marker records with a null config", () => {
    const legacy = {
      "res-1": {
        marker_positive_cd4: { color: [255, 0, 0, 255], count: 3, isVisible: true },
      },
    };
    const result = migrateSidecarOverlays(legacy);
    expect(result["res-1"]).toEqual({
      markers: {
        marker_positive_cd4: { color: [255, 0, 0, 255], count: 3, isVisible: true },
      },
      config: null,
    });
  });

  test("drops unparseable entries without breaking the rest", () => {
    const result = migrateSidecarOverlays({
      "res-1": { markers: "nonsense", config: 42 },
      "res-2": overlayEntry,
    });
    expect(result["res-1"]).toBeUndefined();
    expect(result["res-2"]).toEqual(overlayEntry);
  });

  test("returns an empty record for non-object input", () => {
    expect(migrateSidecarOverlays("nope")).toEqual({});
    expect(migrateSidecarOverlays(null)).toEqual({});
  });
});

describe("viewSettingsDocumentSchema without overlays", () => {
  const baseView = {
    id: "view-1",
    author: "user-1",
    shared: true,
    channels: {},
    channelsOpacity: 1,
    showCellOutline: true,
    annotationsOpacity: 1,
    showAnnotationOutline: true,
  };

  test("parses a v1.2 document and drops stray overlay fields", () => {
    const doc = viewSettingsDocumentSchema.parse({
      cytario: { schemaVersion: "1.2", kind: "settings", image: "s3://b/i.tif", author: "user-1" },
      views: [{ ...baseView, overlays: { "res-1": overlayEntry }, overlaysFillOpacity: 0.8 }],
    });

    expect("overlays" in doc.views[0]).toBe(false);
    expect("overlaysFillOpacity" in doc.views[0]).toBe(false);
  });

  test("still parses a legacy v1.1 document carrying overlays (silently dropped)", () => {
    const doc = viewSettingsDocumentSchema.parse({
      cytario: {
        schemaVersion: "1.1",
        kind: "settings",
        image: "s3://b/i.tif",
        author: "user-1",
      },
      views: [
        { ...baseView, overlays: { "res-1": { arbitrary: true } }, overlaysFillOpacity: 0.5 },
      ],
    });

    expect(doc.views[0].id).toBe("view-1");
    expect("overlays" in doc.views[0]).toBe(false);
  });

  test("sidecarEntryToLayersState yields an empty overlays map and default fill opacity", () => {
    const entry = sidecarEntryToLayersState({
      ...baseView,
      overlays: { "res-1": { arbitrary: true } },
      overlaysFillOpacity: 0.5,
    } as Parameters<typeof sidecarEntryToLayersState>[0]) as LayersStateEntry;

    expect(entry.overlays).toEqual({});
    expect(entry.overlaysFillOpacity).toBe(DEFAULT_OVERLAYS_FILL_OPACITY);
  });

  test("layersStateToSidecarEntry omits overlay state", () => {
    const layersState = {
      ...baseView,
      channelsOpacity: 1,
      overlays: { "res-1": overlayEntry },
      overlaysFillOpacity: 0.8,
      isChannelsLoading: 0,
      isOverlaysLoading: 0,
    } as unknown as LayersStateEntry;

    const asSidecar = layersStateToSidecarEntry(layersState);

    expect("overlays" in asSidecar).toBe(false);
    expect("overlaysFillOpacity" in asSidecar).toBe(false);
  });
});
