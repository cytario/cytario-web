import { render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";

import { ViewerStoreProvider } from "../../../state/store/ViewerStoreContext";
import { FeatureBar } from "../FeatureBar";

const mockSignedFetch = vi.fn();

describe("FeatureBar", () => {
  test("renders the toolbar with tablist", () => {
    const RemixStub = createRoutesStub([
      {
        path: "/connections/test/lab/image.ome.tif",
        Component: () => (
          <ViewerStoreProvider
            url="https://bucket.s3.eu-central-1.amazonaws.com/lab/image.ome.tif"
            signedFetch={mockSignedFetch}
          >
            <FeatureBar />
          </ViewerStoreProvider>
        ),
      },
    ]);

    render(
      <RemixStub
        initialEntries={["/connections/test/lab/image.ome.tif"]}
      />
    );

    expect(screen.getByRole("toolbar")).toBeInTheDocument();
    expect(screen.getByRole("tablist")).toBeInTheDocument();
  });
});
