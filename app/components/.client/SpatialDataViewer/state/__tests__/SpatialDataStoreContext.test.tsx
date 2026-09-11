import type { SpatialData } from "@spatialdata/core";
import { readZarr } from "@spatialdata/core";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { SpatialDataStoreProvider, useSpatialDataStore } from "../SpatialDataStoreContext";
import type { SignedFetch } from "~/utils/signedFetch";

vi.mock("@spatialdata/core", () => ({
  readZarr: vi.fn(),
}));

vi.mock("~/utils/connectionsStore/selectors", () => ({
  resolveResourceId: vi.fn((resourceId: string) => ({ httpsUrl: `https://bucket/${resourceId}` })),
}));

const mockSpatialData = (overrides: Partial<SpatialData> = {}): SpatialData =>
  ({
    images: { blobs_image: { kind: "images", key: "blobs_image" } },
    points: { blobs_points: { kind: "points", key: "blobs_points" } },
    labels: { blobs_labels: { kind: "labels", key: "blobs_labels" } },
    shapes: { blobs_shapes: { kind: "shapes", key: "blobs_shapes" } },
    coordinateSystems: ["global", "microns_1"],
    ...overrides,
  }) as unknown as SpatialData;

const mockSignedFetch = vi.fn() as unknown as SignedFetch;

const StoreProbe = () => {
  const spatialData = useSpatialDataStore((s) => s.spatialData);
  const isLoading = useSpatialDataStore((s) => s.isLoading);
  const coordinateSystem = useSpatialDataStore((s) => s.coordinateSystem);
  const elements = useSpatialDataStore((s) => s.elements);
  return (
    <div>
      <span data-testid="loading">{String(isLoading)}</span>
      <span data-testid="cs">{coordinateSystem ?? "none"}</span>
      <span data-testid="elements">{Object.keys(elements).join(",")}</span>
      <span data-testid="data">{spatialData ? "loaded" : "empty"}</span>
    </div>
  );
};

describe("SpatialDataStoreContext", () => {
  test("loads the SpatialData via readZarr and seeds elements + default coordinate system", async () => {
    vi.mocked(readZarr).mockResolvedValue(mockSpatialData());

    render(
      <SpatialDataStoreProvider resourceId="conn/blobs.sdata.zarr" signedFetch={mockSignedFetch}>
        <StoreProbe />
      </SpatialDataStoreProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("data").textContent).toBe("loaded");
    });

    expect(readZarr).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("loading").textContent).toBe("false");
    expect(screen.getByTestId("cs").textContent).toBe("global");
    expect(screen.getByTestId("elements").textContent).toBe(
      "image:blobs_image,labels:blobs_labels,points:blobs_points,shapes:blobs_shapes",
    );
  });

  test("falls back to the first coordinate system when global is absent", async () => {
    vi.mocked(readZarr).mockResolvedValue(
      mockSpatialData({ coordinateSystems: ["microns_1", "microns_2"] }),
    );

    render(
      <SpatialDataStoreProvider resourceId="conn/no-global.zarr" signedFetch={mockSignedFetch}>
        <StoreProbe />
      </SpatialDataStoreProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("data").textContent).toBe("loaded");
    });
    expect(screen.getByTestId("cs").textContent).toBe("microns_1");
  });

  test("surfaces load errors in state without loading", async () => {
    vi.mocked(readZarr).mockRejectedValue(new Error("store unreadable"));

    render(
      <SpatialDataStoreProvider resourceId="conn/broken.zarr" signedFetch={mockSignedFetch}>
        <StoreProbe />
      </SpatialDataStoreProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("false");
    });
    expect(screen.getByTestId("data").textContent).toBe("empty");
    expect(screen.getByTestId("cs").textContent).toBe("none");
  });
});
