import { beforeEach, describe, expect, test, vi } from "vitest";

import { __resetSpatialDataDetectionCache, isSpatialDataStore } from "../isSpatialDataStore";
import type { SignedFetch } from "~/utils/signedFetch";

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const notFound = () => new Response(null, { status: 404 });

const blobsV3Root = {
  zarr_format: 3,
  node_type: "group",
  attributes: {
    spatialdata_attrs: { version: "0.2", spatialdata_software_version: "0.8.0" },
  },
  consolidated_metadata: {
    kind: "inline",
    must_understand: false,
    metadata: {
      images: { node_type: "group", zarr_format: 3, attributes: {} },
      points: { node_type: "group", zarr_format: 3, attributes: {} },
      labels: {
        node_type: "group",
        zarr_format: 3,
        attributes: { ome: { labels: ["blobs_labels", "blobs_multiscale_labels"] } },
      },
      shapes: { node_type: "group", zarr_format: 3, attributes: {} },
      tables: { node_type: "group", zarr_format: 3, attributes: {} },
    },
  },
};

const omeZarrV3Root = {
  zarr_format: 3,
  node_type: "group",
  attributes: { ome: { version: "0.5", multiscales: [] } },
  consolidated_metadata: {
    kind: "inline",
    must_understand: false,
    metadata: { "0": { node_type: "group", attributes: {} } },
  },
};

const sdataV2Attrs = {
  spatialdata_attrs: { version: "0.1" },
  "images/blobs_image": { ome: { multiscales: [] } },
};

const omeZarrV2Attrs = { multiscales: [{ axes: [], datasets: [] }] };

const sdataV2Consolidated = {
  spatialdata_attrs: { version: "0.1" },
  images: { blobs_image: { attributes: { ome: { multiscales: [] } } } },
  points: { blobs_points: { attributes: {} } },
  labels: { blobs_labels: { attributes: {} } },
  shapes: { blobs_shapes: { attributes: {} } },
};

describe("isSpatialDataStore", () => {
  let signedFetch: ReturnType<typeof vi.fn<SignedFetch>>;

  beforeEach(() => {
    __resetSpatialDataDetectionCache();
    signedFetch = vi.fn<SignedFetch>();
  });

  test("detects the zarr v3 blobs fixture shape via root spatialdata_attrs", async () => {
    signedFetch.mockResolvedValue(jsonResponse(blobsV3Root));
    const result = await isSpatialDataStore(
      "conn/blobs.sdata.zarr",
      "https://bucket/blobs.sdata.zarr",
      signedFetch,
    );
    expect(result).toBe(true);
    expect(signedFetch).toHaveBeenCalledTimes(1);
    expect(signedFetch.mock.calls[0][0]).toBe("https://bucket/blobs.sdata.zarr/zarr.json");
  });

  test("detects a zarr v2 store via .zattrs when zarr.json is absent", async () => {
    signedFetch.mockImplementation((url: string) => {
      if (url.endsWith("zarr.json")) return Promise.resolve(notFound());
      return Promise.resolve(jsonResponse(sdataV2Attrs));
    });
    const result = await isSpatialDataStore(
      "conn/v2.sdata.zarr",
      "https://bucket/v2.sdata.zarr",
      signedFetch,
    );
    expect(result).toBe(true);
    expect(signedFetch.mock.calls[1][0]).toBe("https://bucket/v2.sdata.zarr/.zattrs");
  });

  test("returns false for a plain v3 OME-Zarr store", async () => {
    signedFetch.mockResolvedValue(jsonResponse(omeZarrV3Root));
    const result = await isSpatialDataStore(
      "conn/image.zarr",
      "https://bucket/image.zarr",
      signedFetch,
    );
    expect(result).toBe(false);
  });

  test("returns false for a plain v2 OME-Zarr store", async () => {
    signedFetch.mockImplementation((url: string) => {
      if (url.endsWith("zarr.json")) return Promise.resolve(notFound());
      return Promise.resolve(jsonResponse(omeZarrV2Attrs));
    });
    const result = await isSpatialDataStore(
      "conn/image.zarr",
      "https://bucket/image.zarr",
      signedFetch,
    );
    expect(result).toBe(false);
  });

  test("returns false when neither metadata document resolves", async () => {
    signedFetch.mockResolvedValue(notFound());
    const result = await isSpatialDataStore(
      "conn/image.zarr",
      "https://bucket/image.zarr",
      signedFetch,
    );
    expect(result).toBe(false);
    expect(signedFetch).toHaveBeenCalledTimes(2);
  });

  test("caches the sniff result per resourceId", async () => {
    signedFetch.mockResolvedValue(jsonResponse(blobsV3Root));
    const first = await isSpatialDataStore("conn/a.zarr", "https://bucket/a.zarr", signedFetch);
    const second = await isSpatialDataStore("conn/a.zarr", "https://bucket/a.zarr", signedFetch);
    expect(first).toBe(second);
    expect(signedFetch).toHaveBeenCalledTimes(1);
  });

  test("does not share cache entries across resourceIds", async () => {
    // An earlier test in this file already cached "conn/a.zarr" as a non-sdata
    // store; clear the module cache to assert per-key isolation cleanly.
    __resetSpatialDataDetectionCache();
    const aFetch = vi.fn<SignedFetch>().mockResolvedValue(jsonResponse(blobsV3Root));
    const bFetch = vi.fn<SignedFetch>().mockResolvedValue(notFound());
    await isSpatialDataStore("conn/a.zarr", "https://bucket/a.zarr", aFetch);
    await isSpatialDataStore("conn/b.zarr", "https://bucket/b.zarr", bFetch);
    expect(aFetch).toHaveBeenCalledTimes(1);
    expect(bFetch).toHaveBeenCalledTimes(2);
  });

  test("detects a v2 store with only spatialdata_attrs and element group keys", async () => {
    signedFetch.mockImplementation((url: string) => {
      if (url.endsWith("zarr.json")) return Promise.resolve(notFound());
      return Promise.resolve(jsonResponse(sdataV2Consolidated));
    });
    const result = await isSpatialDataStore(
      "conn/c.sdata.zarr",
      "https://bucket/c.sdata.zarr",
      signedFetch,
    );
    expect(result).toBe(true);
  });

  test("detects a v3 store by top-level consolidated element groups without spatialdata_attrs", async () => {
    signedFetch.mockResolvedValue(
      jsonResponse({
        zarr_format: 3,
        node_type: "group",
        attributes: {},
        consolidated_metadata: {
          kind: "inline",
          must_understand: false,
          metadata: {
            images: { node_type: "group", attributes: {} },
            points: { node_type: "group", attributes: {} },
          },
        },
      }),
    );
    const result = await isSpatialDataStore(
      "conn/no-attrs.sdata.zarr",
      "https://bucket/no-attrs.sdata.zarr",
      signedFetch,
    );
    expect(result).toBe(true);
  });

  test("resolves false on a thrown fetch without caching, so a retry can succeed", async () => {
    const failingFetch = vi.fn<SignedFetch>().mockRejectedValue(new TypeError("Failed to fetch"));
    const first = await isSpatialDataStore(
      "conn/flaky.zarr",
      "https://bucket/flaky.zarr",
      failingFetch,
    );
    expect(first).toBe(false);
    expect(failingFetch).toHaveBeenCalledTimes(1);

    // No cache entry was written: a second call with a working fetch re-sniffs.
    const workingFetch = vi.fn<SignedFetch>().mockResolvedValue(jsonResponse(blobsV3Root));
    const second = await isSpatialDataStore(
      "conn/flaky.zarr",
      "https://bucket/flaky.zarr",
      workingFetch,
    );
    expect(second).toBe(true);
    expect(workingFetch).toHaveBeenCalledTimes(1);
  });
});
