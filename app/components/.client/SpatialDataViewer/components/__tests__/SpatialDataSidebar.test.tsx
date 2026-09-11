import type { SpatialData } from "@spatialdata/core";
import { readZarr } from "@spatialdata/core";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { SpatialDataViewer } from "../SpatialDataViewer";
import type { SignedFetch } from "~/utils/signedFetch";

vi.mock("@spatialdata/core", () => ({
  readZarr: vi.fn(),
}));

vi.mock("@spatialdata/vis", () => ({
  SpatialCanvasViewer: ({ renderStack }: { renderStack: { entries: { id: string }[] } }) => (
    <div
      data-testid="spatial-canvas-stub"
      data-entry-ids={renderStack.entries.map((e) => e.id).join(",")}
    />
  ),
}));

vi.mock("~/utils/connectionsStore/selectors", () => ({
  resolveResourceId: vi.fn((resourceId: string) => ({
    httpsUrl: `https://bucket/${resourceId}`,
  })),
}));

const mockSpatialData = (coordinateSystems: string[]): SpatialData =>
  ({
    images: { blobs_image: { kind: "images", key: "blobs_image" } },
    points: { blobs_points: { kind: "points", key: "blobs_points" } },
    labels: { blobs_labels: { kind: "labels", key: "blobs_labels" } },
    shapes: {
      blobs_circles: { kind: "shapes", key: "blobs_circles" },
      blobs_polygons: { kind: "shapes", key: "blobs_polygons" },
    },
    coordinateSystems,
  }) as unknown as SpatialData;

const signedFetch = vi.fn() as unknown as SignedFetch;

describe("SpatialDataSidebar", () => {
  test("renders grouped element list from the loaded SpatialData", async () => {
    vi.mocked(readZarr).mockResolvedValue(mockSpatialData(["global"]));

    render(<SpatialDataViewer resourceId="conn/blobs.sdata.zarr" signedFetch={signedFetch} />);

    await waitFor(() => {
      expect(screen.getByText("blobs_image")).toBeInTheDocument();
    });

    expect(screen.getByText("Images")).toBeInTheDocument();
    expect(screen.getByText("Labels")).toBeInTheDocument();
    expect(screen.getByText("Points")).toBeInTheDocument();
    expect(screen.getByText("Shapes")).toBeInTheDocument();
    expect(screen.getByText("blobs_circles")).toBeInTheDocument();
    expect(screen.getByText("blobs_polygons")).toBeInTheDocument();
  });

  test("coordinate-system picker renders only when multiple systems exist", async () => {
    vi.mocked(readZarr).mockResolvedValue(mockSpatialData(["global"]));
    render(<SpatialDataViewer resourceId="conn/a.zarr" signedFetch={signedFetch} />);
    await waitFor(() => {
      expect(screen.getByText("blobs_image")).toBeInTheDocument();
    });
    expect(screen.queryByLabelText("Coordinate system")).not.toBeInTheDocument();
  });

  test("coordinate-system picker renders when more than one system exists", async () => {
    vi.mocked(readZarr).mockResolvedValue(mockSpatialData(["global", "microns_1"]));
    render(<SpatialDataViewer resourceId="conn/b.zarr" signedFetch={signedFetch} />);

    const picker = await screen.findByLabelText("Coordinate system");
    expect(picker).toBeInTheDocument();
    expect(picker).toHaveTextContent("global");
  });

  test("toggling element visibility removes the element from the render stack", async () => {
    vi.mocked(readZarr).mockResolvedValue(mockSpatialData(["global"]));
    const user = userEvent.setup();

    render(<SpatialDataViewer resourceId="conn/c.zarr" signedFetch={signedFetch} />);

    const toggle = await screen.findByRole("checkbox", { name: "Toggle blobs_image" });
    expect(toggle).toBeChecked();
    expect(screen.getByTestId("spatial-canvas-stub")).toHaveAttribute(
      "data-entry-ids",
      expect.stringContaining("image:blobs_image"),
    );

    await user.click(toggle);

    expect(toggle).not.toBeChecked();
    expect(screen.getByTestId("spatial-canvas-stub")).not.toHaveAttribute(
      "data-entry-ids",
      expect.stringContaining("image:blobs_image"),
    );
  });
});
