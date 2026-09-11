import type { SpatialData } from "@spatialdata/core";
import { readZarr } from "@spatialdata/core";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { SpatialDataViewer } from "../SpatialDataViewer";
import type { SignedFetch } from "~/utils/signedFetch";

const renderStackRefs: unknown[] = [];

vi.mock("@spatialdata/core", () => ({
  readZarr: vi.fn(),
}));

vi.mock("@spatialdata/vis", () => ({
  SpatialCanvasViewer: ({
    renderStack,
    onViewStateChange,
  }: {
    renderStack: unknown;
    onViewStateChange: (viewState: unknown) => void;
  }) => {
    renderStackRefs.push(renderStack);
    return (
      <div>
        <div data-testid="spatial-canvas-stub" />
        <button
          type="button"
          onClick={() => {
            onViewStateChange({ target: [1, 2], zoom: 3 });
          }}
        >
          pan
        </button>
      </div>
    );
  },
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
    coordinateSystems,
  }) as unknown as SpatialData;

const signedFetch = vi.fn() as unknown as SignedFetch;

const waitForNextRender = async (count: number) => {
  await waitFor(() => {
    expect(renderStackRefs.length).toBeGreaterThan(count);
  });
  return renderStackRefs[renderStackRefs.length - 1];
};

describe("SpatialDataCanvas render stack identity", () => {
  test("renderStack identity stays stable across view-state updates", async () => {
    vi.mocked(readZarr).mockResolvedValue(mockSpatialData(["global"]));

    render(<SpatialDataViewer resourceId="conn/render-identity" signedFetch={signedFetch} />);

    await screen.findByTestId("spatial-canvas-stub");
    const baseline = renderStackRefs[renderStackRefs.length - 1];
    const baselineCount = renderStackRefs.length;

    await userEvent.setup().click(screen.getByRole("button", { name: "pan" }));

    const afterPan = await waitForNextRender(baselineCount);
    expect(afterPan).toBe(baseline);
  });

  test("renderStack rebuilds when an element config actually changes", async () => {
    vi.mocked(readZarr).mockResolvedValue(mockSpatialData(["global"]));

    render(<SpatialDataViewer resourceId="conn/render-rebuild" signedFetch={signedFetch} />);

    await screen.findByTestId("spatial-canvas-stub");
    const baseline = renderStackRefs[renderStackRefs.length - 1];
    const baselineCount = renderStackRefs.length;

    const toggle = await screen.findByRole("checkbox", { name: "Toggle blobs_image" });
    await userEvent.setup().click(toggle);

    const afterToggle = await waitForNextRender(baselineCount);
    expect(afterToggle).not.toBe(baseline);
  });
});
