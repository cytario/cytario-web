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

const mockSignedFetch = vi.fn();

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
          url="https://bucket.s3.amazonaws.com/image.ome.tif"
          signedFetch={mockSignedFetch}
        >
          <div data-testid="child">Child content</div>
        </ViewerStoreProvider>,
      );

      expect(screen.getByTestId("child")).toBeInTheDocument();
      expect(screen.getByText("Child content")).toBeInTheDocument();
    });

    test("creates a new viewer store for a new URL", async () => {
      vi.mocked(loadOmeTiffWithCredentials).mockResolvedValue({
        data: [],
        metadata: {},
      } as never);

      const url = `https://bucket.s3.amazonaws.com/new-${Date.now()}.ome.tif`;
      render(
        <ViewerStoreProvider url={url} signedFetch={mockSignedFetch}>
          <div>Test</div>
        </ViewerStoreProvider>,
      );

      await waitFor(() => {
        expect(createViewerStore).toHaveBeenCalled();
      });
    });

    test("returns existing store for same URL", async () => {
      vi.mocked(loadOmeTiffWithCredentials).mockResolvedValue({
        data: [],
        metadata: {},
      } as never);

      const url = `https://bucket.s3.amazonaws.com/same-${Date.now()}.ome.tif`;
      const { rerender } = render(
        <ViewerStoreProvider url={url} signedFetch={mockSignedFetch}>
          <div>Test</div>
        </ViewerStoreProvider>,
      );

      await waitFor(() => {
        expect(createViewerStore).toHaveBeenCalledTimes(1);
      });

      rerender(
        <ViewerStoreProvider url={url} signedFetch={mockSignedFetch}>
          <div>Test Updated</div>
        </ViewerStoreProvider>,
      );

      expect(createViewerStore).toHaveBeenCalledTimes(1);
    });
  });

  describe("registerViewer", () => {
    test("calls loadOmeTiffWithCredentials for TIFF files", async () => {
      // Use unique URL to avoid cache hit from previous tests
      const uniqueUrl = `https://bucket.s3.amazonaws.com/image-${Date.now()}.ome.tif`;
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
        <ViewerStoreProvider url={uniqueUrl} signedFetch={mockSignedFetch}>
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
        <ViewerStoreProvider
          url="https://bucket.s3.amazonaws.com/image.zarr"
          signedFetch={mockSignedFetch}
        >
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
          url={`https://bucket.s3.amazonaws.com/bad-${Date.now()}.ome.tif`}
          signedFetch={mockSignedFetch}
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
