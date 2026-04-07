import { render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";

import { ViewerStoreProvider } from "../../../state/store/ViewerStoreContext";
import { FeatureBar } from "../FeatureBar";

const mockConnection = {
  credentials: {
    AccessKeyId: "AKIAIOSFODNN7EXAMPLE",
    SecretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    SessionToken: "token",
    Expiration: new Date(),
  },
  connectionConfig: {
    id: 1, name: "test", bucketName: "vericura-image-data", ownerScope: "org",
    createdBy: "user", provider: "aws", endpoint: "", roleArn: null, region: "us-east-1", prefix: "",
  },
};

describe("FeatureBar", () => {
  test("renders all main sections", () => {
    const RemixStub = createRoutesStub([
      {
        path: "/connections/vericura-image-data/lab/USL-2024-58461-31.ome.tif",
        Component: () => (
          <ViewerStoreProvider
            connection={mockConnection}
            pathName="lab/USL-2024-58461-31.ome.tif"
          >
            <FeatureBar />
          </ViewerStoreProvider>
        ),
      },
    ]);

    render(
      <RemixStub
        initialEntries={[
          "/connections/vericura-image-data/lab/USL-2024-58461-31.ome.tif",
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
