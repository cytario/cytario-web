import type { Credentials } from "@aws-sdk/client-sts";
import { render, screen, waitFor } from "@testing-library/react";

import { loadBioformatsZarrWithCredentials } from "../../loaders/loadBioformatsZarrWithCredentials";
import { loadOmeTiffWithCredentials } from "../../loaders/loadOmeTiffWithCredentials";
import { createViewerStore } from "../createViewerStore";
import { ViewerStoreProvider, useViewerStore } from "../ViewerStoreContext";

vi.mock("../../loaders/loadOmeTiffWithCredentials", () => ({
  loadOmeTiffWithCredentials: vi.fn(),
}));

vi.mock("../../loaders/loadBioformatsZarrWithCredentials", () => ({
  loadBioformatsZarrWithCredentials: vi.fn(),
}));

vi.mock("../createViewerStore", () => ({
  createViewerStore: vi.fn(),
}));

vi.mock("~/utils/signedFetch", () => ({
  createSignedFetch: vi.fn(() => vi.fn()),
}));

vi.mock("~/utils/zarrUtils", () => ({
  isZarrPath: vi.fn((p: string) => /\.zarr(\/|$|\?)/.test(p)),
  constructS3Url: vi.fn(
    (_config: unknown, pathName: string) =>
      `https://bucket.s3.amazonaws.com/${pathName}`,
  ),
}));

vi.mock("~/utils/resourceId", () => ({
  createResourceId: vi.fn((...args: string[]) => args.join("/")),
}));

const mockCredentials: Credentials = {
  AccessKeyId: "AKIAIOSFODNN7EXAMPLE",
  SecretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
  SessionToken: "token",
  Expiration: new Date(),
};

const mockConnectionConfig = {
  id: 1,
  name: "test-connection",
  bucketName: "test-bucket",
  ownerScope: "org-1",
  createdBy: "user-1",
  provider: "aws",
  endpoint: "",
  roleArn: null,
  region: "us-east-1",
  prefix: "",
};

const mockConnection = {
  credentials: mockCredentials,
  connectionConfig: mockConnectionConfig,
};

describe("ViewerStoreContext", () => {
  const mockViewerStore = {
    getState: vi.fn(() => ({
      setLoader: vi.fn(),
      setMetadata: vi.fn(),
      setError: vi.fn(),
      setIsViewerLoading: vi.fn(),
    })),
    setState: vi.fn(),
    subscribe: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createViewerStore).mockReturnValue(
      mockViewerStore as unknown as ReturnType<typeof createViewerStore>,
    );
  });

  describe("ViewerStoreProvider", () => {
    test("renders children", () => {
      vi.mocked(loadOmeTiffWithCredentials).mockResolvedValue({
        data: [],
        metadata: {},
      } as never);

      render(
        <ViewerStoreProvider
          connection={mockConnection}
          pathName="image.ome.tif"
        >
          <div data-testid="child">Child content</div>
        </ViewerStoreProvider>,
      );

      expect(screen.getByTestId("child")).toBeInTheDocument();
      expect(screen.getByText("Child content")).toBeInTheDocument();
    });

    test("creates a new viewer store for a new pathName", async () => {
      vi.mocked(loadOmeTiffWithCredentials).mockResolvedValue({
        data: [],
        metadata: {},
      } as never);

      render(
        <ViewerStoreProvider
          connection={mockConnection}
          pathName="new-image.ome.tif"
        >
          <div>Test</div>
        </ViewerStoreProvider>,
      );

      await waitFor(() => {
        expect(createViewerStore).toHaveBeenCalled();
      });
    });

    test("returns existing store for same pathName and credentials", async () => {
      vi.mocked(loadOmeTiffWithCredentials).mockResolvedValue({
        data: [],
        metadata: {},
      } as never);

      const { rerender } = render(
        <ViewerStoreProvider
          connection={mockConnection}
          pathName="same-image.ome.tif"
        >
          <div>Test</div>
        </ViewerStoreProvider>,
      );

      await waitFor(() => {
        expect(createViewerStore).toHaveBeenCalledTimes(1);
      });

      rerender(
        <ViewerStoreProvider
          connection={mockConnection}
          pathName="same-image.ome.tif"
        >
          <div>Test Updated</div>
        </ViewerStoreProvider>,
      );

      expect(createViewerStore).toHaveBeenCalledTimes(1);
    });
  });

  describe("registerViewer", () => {
    test("calls loadOmeTiffWithCredentials for TIFF files", async () => {
      // Use unique pathName to avoid cache hit from previous tests
      const uniquePath = `image-${Date.now()}.ome.tif`;
      const mockLoader = [{ type: "tiff" }];
      const mockMetadata = { name: "test.tiff" };
      const setLoader = vi.fn();
      const setMetadata = vi.fn();
      const setIsViewerLoading = vi.fn();

      vi.mocked(createViewerStore).mockReturnValue({
        getState: vi.fn(() => ({
          setLoader,
          setMetadata,
          setError: vi.fn(),
          setIsViewerLoading,
        })),
        setState: vi.fn(),
        subscribe: vi.fn(),
      } as unknown as ReturnType<typeof createViewerStore>);

      vi.mocked(loadOmeTiffWithCredentials).mockResolvedValue({
        data: mockLoader,
        metadata: mockMetadata,
      } as never);

      render(
        <ViewerStoreProvider connection={mockConnection} pathName={uniquePath}>
          <div>Test</div>
        </ViewerStoreProvider>,
      );

      await waitFor(() => {
        expect(loadOmeTiffWithCredentials).toHaveBeenCalled();
        expect(setLoader).toHaveBeenCalledWith(mockLoader);
        expect(setMetadata).toHaveBeenCalledWith(mockMetadata);
        expect(setIsViewerLoading).toHaveBeenCalledWith(false);
      });
    });

    test("calls loadBioformatsZarrWithCredentials for zarr files", async () => {
      const mockLoader = [{ type: "zarr" }];
      const mockMetadata = { name: "test.zarr" };
      const setLoader = vi.fn();
      const setMetadata = vi.fn();
      const setIsViewerLoading = vi.fn();

      vi.mocked(createViewerStore).mockReturnValue({
        getState: vi.fn(() => ({
          setLoader,
          setMetadata,
          setError: vi.fn(),
          setIsViewerLoading,
        })),
        setState: vi.fn(),
        subscribe: vi.fn(),
      } as unknown as ReturnType<typeof createViewerStore>);

      vi.mocked(loadBioformatsZarrWithCredentials).mockResolvedValue({
        data: mockLoader,
        metadata: mockMetadata,
      } as never);

      render(
        <ViewerStoreProvider connection={mockConnection} pathName="image.zarr">
          <div>Test</div>
        </ViewerStoreProvider>,
      );

      await waitFor(() => {
        expect(loadBioformatsZarrWithCredentials).toHaveBeenCalled();
        expect(setLoader).toHaveBeenCalledWith(mockLoader);
        expect(setMetadata).toHaveBeenCalledWith(mockMetadata);
        expect(setIsViewerLoading).toHaveBeenCalledWith(false);
      });
    });

    test("sets error state on load failure", async () => {
      const mockError = new Error("Failed to load image");
      const setError = vi.fn();
      const setIsViewerLoading = vi.fn();

      vi.mocked(createViewerStore).mockReturnValue({
        getState: vi.fn(() => ({
          setLoader: vi.fn(),
          setMetadata: vi.fn(),
          setError,
          setIsViewerLoading,
        })),
        setState: vi.fn(),
        subscribe: vi.fn(),
      } as unknown as ReturnType<typeof createViewerStore>);

      vi.mocked(loadOmeTiffWithCredentials).mockRejectedValue(mockError);

      render(
        <ViewerStoreProvider
          connection={mockConnection}
          pathName="bad-image.ome.tif"
        >
          <div>Test</div>
        </ViewerStoreProvider>,
      );

      await waitFor(() => {
        expect(setError).toHaveBeenCalledWith(mockError);
        expect(setIsViewerLoading).toHaveBeenCalledWith(false);
      });
    });
  });

  describe("useViewerStore", () => {
    test("throws error when used outside ViewerStoreProvider", () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      expect(() => {
        const TestComponent = () => {
          useViewerStore((state) => state);
          return null;
        };
        render(<TestComponent />);
      }).toThrow(
        "useViewerStoreContext must be used within ViewerStoreProvider",
      );

      consoleSpy.mockRestore();
    });
  });
});
