import {
  migrateSidecarOverlays,
  sidecarEntryToLayersState,
  viewSettingsDocumentSchema,
} from "../viewSettingsSchema";
import type { LayersStateEntry } from "~/components/.client/ImageViewer/state/store/types";

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

describe("viewSettingsDocumentSchema with overlay entries", () => {
  const baseView = {
    id: "view-1",
    author: "user-1",
    shared: true,
    channels: {},
    channelsOpacity: 1,
    overlays: { "res-1": overlayEntry },
    overlaysFillOpacity: 0.8,
    showCellOutline: true,
    annotationsOpacity: 1,
    showAnnotationOutline: true,
  };

  test("parses a v1.1 document with a full overlay config", () => {
    const doc = viewSettingsDocumentSchema.parse({
      cytario: { schemaVersion: "1.1", kind: "settings", image: "s3://b/i.tif", author: "user-1" },
      views: [baseView],
    });

    expect(doc.views[0].overlays["res-1"]).toEqual(overlayEntry);
  });

  test("still parses a legacy v1.0 document with unknown overlays", () => {
    const doc = viewSettingsDocumentSchema.parse({
      cytario: { schemaVersion: "1.0", kind: "settings", image: "s3://b/i.tif", author: "user-1" },
      views: [{ ...baseView, overlays: { "res-1": { arbitrary: true } } }],
    });

    // The union's permissive arm accepts unknown shapes for read compatibility.
    expect(doc.views[0].overlays).toEqual({ "res-1": { arbitrary: true } });
  });

  test("sidecarEntryToLayersState migrates overlays into the entry shape", () => {
    const entry = sidecarEntryToLayersState({
      ...baseView,
      overlays: {
        "res-1": {
          marker_positive_cd4: { color: [255, 0, 0, 255], count: 3, isVisible: true },
        },
      },
    }) as LayersStateEntry;

    expect(entry.overlays["res-1"]).toEqual({
      markers: {
        marker_positive_cd4: { color: [255, 0, 0, 255], count: 3, isVisible: true },
      },
      config: null,
    });
  });

  test("round-trips a full overlay config through entry conversion", () => {
    const asSidecar = {
      ...baseView,
      overlays: { "res-1": overlayEntry },
    };
    const asLayers = sidecarEntryToLayersState(asSidecar) as LayersStateEntry;

    expect(asLayers.overlays["res-1"]?.config).toEqual(overlayEntry.config);
    expect(asLayers.overlays["res-1"]?.markers).toEqual(overlayEntry.markers);
  });
});
