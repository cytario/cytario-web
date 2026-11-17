import { DEFAULT_ANNOTATIONS_OPACITY } from "../annotationDefaults";
import { select } from "~/components/.client/ImageViewer/state/store/selectors";
import { createDefaultLayersStateEntry } from "~/components/.client/ImageViewer/state/store/types";
import type { ViewerStore } from "~/components/.client/ImageViewer/state/store/types";
import {
  sidecarEntryToLayersState,
  viewSettingsDocumentSchema,
} from "~/utils/db/viewSettingsSchema";

describe("DEFAULT_ANNOTATIONS_OPACITY", () => {
  test("is fully transparent", () => {
    expect(DEFAULT_ANNOTATIONS_OPACITY).toBe(0);
  });

  test("seeds a new layers state entry", () => {
    expect(createDefaultLayersStateEntry().annotationsOpacity).toBe(DEFAULT_ANNOTATIONS_OPACITY);
  });

  test("is the selector fallback when no layers state exists", () => {
    const emptyStore = { imagePanels: [0], imagePanelIndex: 0, layersStates: [] };
    expect(select.annotationsOpacity(emptyStore as unknown as ViewerStore)).toBe(
      DEFAULT_ANNOTATIONS_OPACITY,
    );
  });

  test("the sidecar schema fills it in when the field is missing", () => {
    const doc = viewSettingsDocumentSchema.parse({
      cytario: {
        schemaVersion: "1.2",
        kind: "settings",
        image: "s3://b/i.tif",
        author: "user-1",
      },
      views: [
        {
          id: "view-1",
          author: "user-1",
          shared: true,
          channels: {},
          channelsOpacity: 1,
          showCellOutline: true,
          showAnnotationOutline: true,
        },
      ],
    });
    expect(doc.views[0].annotationsOpacity).toBe(DEFAULT_ANNOTATIONS_OPACITY);
    const entry = sidecarEntryToLayersState(doc.views[0]);
    expect(entry.annotationsOpacity).toBe(DEFAULT_ANNOTATIONS_OPACITY);
  });

  test("an explicit sidecar value is kept, not overwritten", () => {
    const doc = viewSettingsDocumentSchema.parse({
      cytario: {
        schemaVersion: "1.2",
        kind: "settings",
        image: "s3://b/i.tif",
        author: "user-1",
      },
      views: [
        {
          id: "view-1",
          author: "user-1",
          shared: true,
          channels: {},
          channelsOpacity: 1,
          annotationsOpacity: 0.7,
          showCellOutline: true,
          showAnnotationOutline: true,
        },
      ],
    });
    expect(doc.views[0].annotationsOpacity).toBe(0.7);
  });
});
