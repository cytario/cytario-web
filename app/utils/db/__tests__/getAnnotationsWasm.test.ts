import type { FeatureCollection } from "geojson";
import { describe, expect, it, vi } from "vitest";

import { readAllAnnotations } from "../getAnnotationsWasm";
import type { AnnotationFeature } from "../getAnnotationsWasm";
import { SidecarRepository } from "../sidecarRepository";

vi.mock("../sidecarRepository", () => ({
  SidecarRepository: { readAll: vi.fn() },
}));

const readAllMock = vi.mocked(SidecarRepository.readAll);

const makeFeature = (): AnnotationFeature => ({
  type: "Feature",
  geometry: { type: "Point", coordinates: [0, 0] },
  properties: {},
});

const featureCollection = (features: AnnotationFeature[]): FeatureCollection => ({
  type: "FeatureCollection",
  features,
});

describe("readAllAnnotations", () => {
  it("maps each user's FeatureCollection to their feature array", async () => {
    const f1 = makeFeature();
    const f2 = makeFeature();
    readAllMock.mockResolvedValue({
      "user-a": featureCollection([f1]),
      "user-b": featureCollection([f2]),
    });

    const result = await readAllAnnotations("conn/slide.ome.tif");

    expect(result["user-a"]).toEqual([f1]);
    expect(result["user-b"]).toEqual([f2]);
  });

  it("drops users whose feature array is empty (lazy-create semantics)", async () => {
    readAllMock.mockResolvedValue({
      "user-a": featureCollection([makeFeature()]),
      "user-empty": featureCollection([]),
    });

    const result = await readAllAnnotations("conn/slide.ome.tif");

    expect(Object.keys(result)).toEqual(["user-a"]);
    expect(result["user-empty"]).toBeUndefined();
  });

  it("drops users whose sidecar is null (missing file)", async () => {
    readAllMock.mockResolvedValue({
      "user-a": featureCollection([makeFeature()]),
      "user-null": null as unknown as FeatureCollection,
    });

    const result = await readAllAnnotations("conn/slide.ome.tif");

    expect(Object.keys(result)).toEqual(["user-a"]);
  });

  it("returns an empty map when no sidecars exist", async () => {
    readAllMock.mockResolvedValue({});

    const result = await readAllAnnotations("conn/slide.ome.tif");

    expect(result).toEqual({});
  });

  it("passes resourceId and the 'annotations' kind to SidecarRepository.readAll", async () => {
    readAllMock.mockResolvedValue({});

    await readAllAnnotations("conn/slide.ome.tif");

    expect(readAllMock).toHaveBeenCalledWith("conn/slide.ome.tif", "annotations");
  });
});
