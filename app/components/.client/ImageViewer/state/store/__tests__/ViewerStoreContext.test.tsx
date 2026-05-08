import { render, screen, waitFor } from "@testing-library/react";

import { createViewerStore } from "../createViewerStore";
import { ViewerStoreProvider, useViewerStore } from "../ViewerStoreContext";

// Stub the registry so module-load of ViewerStoreContext (which calls
// registerBuiltinFormats at the top) does not pull viv/geotiff into the
// test environment, and so we can control resolve() per test.
const resolveMock = vi.fn();
vi.mock("~/components/ImageViewer/state/formatRegistry", () => ({
  formatRegistry: {
    resolve: (...args: unknown[]) => resolveMock(...args),
    add: vi.fn(),
    list: vi.fn(() => []),
    scopedFor: vi.fn(),
    __reset: vi.fn(),
  },
  UnknownFormatError: class UnknownFormatError extends Error {},
  DuplicateRegistrationError: class DuplicateRegistrationError extends Error {},
}));
vi.mock("../../formats/builtins", () => ({
  registerBuiltinFormats: vi.fn(),
  __resetBuiltinFormats: vi.fn(),
}));
vi.mock("../createViewerStore", () => ({
  createViewerStore: vi.fn(),
}));
vi.mock("~/utils/signedFetch", () => ({
  createSignedFetch: vi.fn(() => vi.fn()),
}));
vi.mock("~/utils/resourceId", () => ({
  createResourceId: vi.fn((...args: string[]) => args.join("/")),
  constructS3Url: vi.fn(
    (_config: unknown, s3Key: string) => `https://bucket.s3.amazonaws.com/${s3Key}`,
  ),
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
    resolveMock.mockReset();
    vi.mocked(createViewerStore).mockReturnValue(
      mockViewerStore as unknown as ReturnType<typeof createViewerStore>,
    );
  });

  describe("ViewerStoreProvider", () => {
    test("renders children", () => {
      resolveMock.mockReturnValue({
        extension: "ome.tif",
        pluginName: "cytario-web",
        handler: {
          load: vi.fn().mockResolvedValue({ data: [], metadata: {} } as never),
        },
      });

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
      resolveMock.mockReturnValue({
        extension: "ome.tif",
        pluginName: "cytario-web",
        handler: {
          load: vi.fn().mockResolvedValue({ data: [], metadata: {} } as never),
        },
      });

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
      resolveMock.mockReturnValue({
        extension: "ome.tif",
        pluginName: "cytario-web",
        handler: {
          load: vi.fn().mockResolvedValue({ data: [], metadata: {} } as never),
        },
      });

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
    test("dispatches the resolved handler's load() with signedFetch and signal", async () => {
      const uniqueUrl = `https://bucket.s3.amazonaws.com/image-${Date.now()}.ome.tif`;
      const mockLoader = [{ type: "tiff" }];
      const mockMetadata = { name: "test.tiff" };
      const setLoader = vi.fn();
      const setMetadata = vi.fn();
      const setIsViewerLoading = vi.fn();
      const handlerLoad = vi
        .fn()
        .mockResolvedValue({ data: mockLoader, metadata: mockMetadata } as never);

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

      resolveMock.mockReturnValue({
        extension: "ome.tif",
        pluginName: "cytario-web",
        handler: { load: handlerLoad },
      });

      render(
        <ViewerStoreProvider url={uniqueUrl} signedFetch={mockSignedFetch}>
          <div>Test</div>
        </ViewerStoreProvider>,
      );

      await waitFor(() => {
        expect(handlerLoad).toHaveBeenCalled();
        const [calledUrl, calledOpts] = handlerLoad.mock.calls[0];
        expect(calledUrl).toBe(uniqueUrl);
        expect(calledOpts.signedFetch).toBe(mockSignedFetch);
        expect(calledOpts.signal).toBeInstanceOf(AbortSignal);
        expect(setLoader).toHaveBeenCalledWith(mockLoader);
        expect(setMetadata).toHaveBeenCalledWith(mockMetadata);
        expect(setIsViewerLoading).toHaveBeenCalledWith(false);
      });
    });

    test("dispatches differently for zarr URL (routed by registry, not URL branch)", async () => {
      const uniqueUrl = `https://bucket.s3.amazonaws.com/img-${Date.now()}.zarr`;
      const mockLoader = [{ type: "zarr" }];
      const mockMetadata = { name: "test.zarr" };
      const setLoader = vi.fn();
      const setMetadata = vi.fn();
      const setIsViewerLoading = vi.fn();
      const handlerLoad = vi
        .fn()
        .mockResolvedValue({ data: mockLoader, metadata: mockMetadata } as never);

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

      resolveMock.mockReturnValue({
        extension: "ome.zarr",
        pluginName: "cytario-web",
        handler: { load: handlerLoad },
      });

      render(
        <ViewerStoreProvider url={uniqueUrl} signedFetch={mockSignedFetch}>
          <div>Test</div>
        </ViewerStoreProvider>,
      );

      await waitFor(() => {
        expect(handlerLoad).toHaveBeenCalled();
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

      resolveMock.mockReturnValue({
        extension: "ome.tif",
        pluginName: "cytario-web",
        handler: { load: vi.fn().mockRejectedValue(mockError) },
      });

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
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      expect(() => {
        const TestComponent = () => {
          useViewerStore((state) => state);
          return null;
        };
        render(<TestComponent />);
      }).toThrow("useViewerStoreContext must be used within ViewerStoreProvider");

      consoleSpy.mockRestore();
    });
  });
});
