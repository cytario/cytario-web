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
  name?: string,
): FeatureCollection & { cytario?: { createdBy?: string; name?: string } } => ({
  type: "FeatureCollection",
  features,
  ...(createdBy || name
    ? { cytario: { ...(createdBy ? { createdBy } : {}), ...(name ? { name } : {}) } }
    : {}),
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
    expect(result[0]).toEqual({
      id: "set-a",
      createdBy: "user-a",
      features: [f1],
      name: undefined,
    });
    expect(result[1]).toEqual({
      id: "set-b",
      createdBy: "user-b",
      features: [f2],
      name: undefined,
    });
  });

  it("reads the set's display name from cytario.name", async () => {
    const f1 = makeFeature();
    readAllMock.mockResolvedValue({
      "set-named": featureCollection([f1], "user-a", "Tumor review"),
      "set-unnamed": featureCollection([makeFeature()], "user-b"),
    });

    const result = await readAllAnnotations("conn/slide.ome.tif");

    expect(result[0].name).toBe("Tumor review");
    expect(result[1].name).toBeUndefined();
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

  it("leaves createdBy undefined when cytario envelope is absent (QuPath export)", async () => {
    const f1 = makeFeature();
    readAllMock.mockResolvedValue({
      "qupath-set": featureCollection([f1]),
    });

    const result = await readAllAnnotations("conn/slide.ome.tif");

    expect(result[0].createdBy).toBeUndefined();
  });
});
