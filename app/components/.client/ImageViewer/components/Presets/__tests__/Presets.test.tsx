import { render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";

import { ViewerStoreProvider } from "../../../state/store/ViewerStoreContext";
import { Presets } from "../Presets";

const mockSignedFetch = vi.fn();

function renderPresets() {
  const RemixStub = createRoutesStub([
    {
      path: "/connections/test-bucket/test.ome.tif",
      Component: () => (
        <ViewerStoreProvider resourceId="test-bucket/test.ome.tif" signedFetch={mockSignedFetch}>
          <Presets />
        </ViewerStoreProvider>
      ),
    },
  ]);

  return render(<RemixStub initialEntries={["/connections/test-bucket/test.ome.tif"]} />);
}

describe("Presets", () => {
  test("renders as a FeatureItem accordion with title 'Presets'", () => {
    renderPresets();
    expect(screen.getByText("Presets")).toBeInTheDocument();
  });
});
