import type { FeatureCollection } from "geojson";
import { describe, expect, it, vi } from "vitest";

import { readAllAnnotations } from "../getAnnotationsWasm";
import type { AnnotationFeature } from "../getAnnotationsWasm";
import { SidecarRepository } from "../sidecarRepository";

vi.mock("../sidecarRepository", () => ({
  SidecarRepository: { readAll: vi.fn() },
}));

const readAllMock = vi.mocked(SidecarRepository.readAll);

let featureSeq = 0;
const makeFeature = (): AnnotationFeature => ({
  type: "Feature",
  id: `f${++featureSeq}`,
  geometry: { type: "Point", coordinates: [0, 0] },
  properties: {},
});

const featureCollection = (
  features: AnnotationFeature[],
  createdBy?: string,
): FeatureCollection & { cytario?: { createdBy?: string } } => ({
  type: "FeatureCollection",
  features,
  ...(createdBy ? { cytario: { createdBy } } : {}),
});

const legacyFeatureCollection = (
  features: AnnotationFeature[],
  author?: string,
): FeatureCollection & { cytario?: { author?: string } } => ({
  type: "FeatureCollection",
  features,
  ...(author ? { cytario: { author } } : {}),
});

describe("readAllAnnotations", () => {
  it("maps each set's FeatureCollection to an AnnotationSet", async () => {
    const f1 = makeFeature();
    const f2 = makeFeature();
    readAllMock.mockResolvedValue({
      "set-a": featureCollection([f1], "user-a"),
      "set-b": featureCollection([f2], "user-b"),
    });

    const result = await readAllAnnotations("conn/slide.ome.tif");

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ id: "set-a", createdBy: "user-a", features: [f1] });
    expect(result[1]).toEqual({ id: "set-b", createdBy: "user-b", features: [f2] });
  });

  it("drops sets whose feature array is empty (lazy-create semantics)", async () => {
    readAllMock.mockResolvedValue({
      "set-a": featureCollection([makeFeature()], "user-a"),
      "set-empty": featureCollection([], "user-empty"),
    });

    const result = await readAllAnnotations("conn/slide.ome.tif");

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("set-a");
  });

  it("drops sets whose sidecar is null (missing file)", async () => {
    readAllMock.mockResolvedValue({
      "set-a": featureCollection([makeFeature()], "user-a"),
      "set-null": null as unknown as FeatureCollection,
    });

    const result = await readAllAnnotations("conn/slide.ome.tif");

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("set-a");
  });

  it("returns an empty array when no sidecars exist", async () => {
    readAllMock.mockResolvedValue({});

    const result = await readAllAnnotations("conn/slide.ome.tif");

    expect(result).toEqual([]);
  });

  it("passes resourceId and the 'annotations' kind to SidecarRepository.readAll", async () => {
    readAllMock.mockResolvedValue({});

    await readAllAnnotations("conn/slide.ome.tif");

    expect(readAllMock).toHaveBeenCalledWith("conn/slide.ome.tif", "annotations");
  });

  it("falls back to cytario.author when cytario.createdBy is absent (legacy)", async () => {
    const f1 = makeFeature();
    readAllMock.mockResolvedValue({
      "legacy-set": legacyFeatureCollection([f1], "legacy-user"),
    });

    const result = await readAllAnnotations("conn/slide.ome.tif");

    expect(result[0].createdBy).toBe("legacy-user");
  });

  it("falls back to setId as createdBy when both cytario fields are absent", async () => {
    const f1 = makeFeature();
    readAllMock.mockResolvedValue({
      "legacy-user-id": featureCollection([f1]),
    });

    const result = await readAllAnnotations("conn/slide.ome.tif");

    expect(result[0].createdBy).toBe("legacy-user-id");
  });
});
