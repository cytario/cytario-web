import { render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";

import { ViewerStoreProvider } from "../../../state/store/ViewerStoreContext";
import { Presets } from "../Presets";

const mockConnection = {
  credentials: {
    AccessKeyId: "AKIAIOSFODNN7EXAMPLE",
    SecretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    SessionToken: "token",
    Expiration: new Date(),
  },
  connectionConfig: {
    id: 1, name: "test", bucketName: "test-bucket", ownerScope: "org",
    createdBy: "user", provider: "aws", endpoint: "", roleArn: null, region: "us-east-1", prefix: "",
  },
};

function renderPresets() {
  const RemixStub = createRoutesStub([
    {
      path: "/connections/test-bucket/test.ome.tif",
      Component: () => (
        <ViewerStoreProvider
          connection={mockConnection}
          pathName="test.ome.tif"
        >
          <Presets>
            <div data-testid="preset-content">Content</div>
          </Presets>
        </ViewerStoreProvider>
      ),
    },
  ]);

  return render(
    <RemixStub initialEntries={["/connections/test-bucket/test.ome.tif"]} />
  );
}

describe("Presets", () => {
  test("renders 4 preset tabs with number labels", () => {
    renderPresets();

    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(4);

    // Each tab should display its 1-indexed number
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
  });

  test("tabs have accessible labels", () => {
    renderPresets();

    for (let i = 1; i <= 4; i++) {
      expect(
        screen.getByRole("tab", { name: `Channels preset ${i}` })
      ).toBeInTheDocument();
    }
  });

  test("tabs do not have inline background style that overrides CSS classes", () => {
    renderPresets();

    const tabs = screen.getAllByRole("tab");
    for (const tab of tabs) {
      // The tab element must NOT have style="background: transparent" which
      // would override the Tailwind bg-* classes and make tabs invisible
      expect(tab).not.toHaveStyle({ background: "transparent" });
    }
  });

  test("renders tablist container", () => {
    renderPresets();
    expect(screen.getByRole("tablist")).toBeInTheDocument();
  });

  test("renders children content", () => {
    renderPresets();
    expect(screen.getByTestId("preset-content")).toBeInTheDocument();
  });
});
