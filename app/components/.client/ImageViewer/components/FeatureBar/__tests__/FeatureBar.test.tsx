import { render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";

import { ViewerStoreProvider } from "../../../state/ViewerStoreContext";
import { FeatureBar } from "../FeatureBar";

describe("FeatureBar", () => {
  test("renders all main sections", () => {
    const RemixStub = createRoutesStub([
      {
        path: "/buckets/vericura-image-data/lab/USL-2024-58461-31.ome.tif",
        Component: () => (
          <ViewerStoreProvider
            resourceId={"vericura-image-data/lab/USL-2024-58461-31.ome.tif"}
            url={"USL-2024-58461-31.ome.tif"}
          >
            <FeatureBar />
          </ViewerStoreProvider>
        ),
      },
    ]);

    render(
      <RemixStub
        initialEntries={[
          "/buckets/vericura-image-data/lab/USL-2024-58461-31.ome.tif",
        ]}
      />
    );

    expect(screen.getByRole("toolbar")).toBeInTheDocument();

    expect(
      screen.getByRole("button", { name: "Channels" })
    ).toBeInTheDocument();

    expect(
      screen.getByRole("button", { name: "Overlays" })
    ).toBeInTheDocument();

    expect(
      screen.getByRole("button", { name: "Toggle Feature Bar" })
    ).toBeInTheDocument();
  });
});
