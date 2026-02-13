import { loadOmeTiff } from "@hms-dbmi/viv";
import { render, screen, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

import { createViewerStore } from "../createViewerStore";
import { ViewerStoreProvider, useViewerStore } from "../ViewerStoreContext";

vi.mock("@hms-dbmi/viv", () => ({
  loadOmeTiff: vi.fn(),
}));

vi.mock("../createViewerStore", () => ({
  createViewerStore: vi.fn(),
}));

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
      mockViewerStore as unknown as ReturnType<typeof createViewerStore>
    );
  });

  describe("ViewerStoreProvider", () => {
    test("renders children", () => {
      vi.mocked(loadOmeTiff).mockResolvedValue({
        data: [],
        metadata: {},
      } as unknown as Awaited<ReturnType<typeof loadOmeTiff>>);

      render(
        <ViewerStoreProvider
          resourceId="test-id"
          url="https://example.com/image.tiff"
        >
          <div data-testid="child">Child content</div>
        </ViewerStoreProvider>
      );

      expect(screen.getByTestId("child")).toBeInTheDocument();
      expect(screen.getByText("Child content")).toBeInTheDocument();
    });

    test("creates a new viewer store for a new resourceId", async () => {
      vi.mocked(loadOmeTiff).mockResolvedValue({
        data: [],
        metadata: {},
      } as unknown as Awaited<ReturnType<typeof loadOmeTiff>>);

      render(
        <ViewerStoreProvider
          resourceId="new-viewer"
          url="https://example.com/image.tiff"
        >
          <div>Test</div>
        </ViewerStoreProvider>
      );

      await waitFor(() => {
        expect(createViewerStore).toHaveBeenCalledWith("new-viewer");
      });
    });

    test("returns existing store for same resourceId", async () => {
      vi.mocked(loadOmeTiff).mockResolvedValue({
        data: [],
        metadata: {},
      } as unknown as Awaited<ReturnType<typeof loadOmeTiff>>);

      const { rerender } = render(
        <ViewerStoreProvider
          resourceId="same-id"
          url="https://example.com/image.tiff"
        >
          <div>Test</div>
        </ViewerStoreProvider>
      );

      // Wait for initial registration
      await waitFor(() => {
        expect(createViewerStore).toHaveBeenCalledTimes(1);
      });

      // Re-render with same resourceId
      rerender(
        <ViewerStoreProvider
          resourceId="same-id"
          url="https://example.com/image.tiff"
        >
          <div>Test Updated</div>
        </ViewerStoreProvider>
      );

      // Should still only have created one store
      expect(createViewerStore).toHaveBeenCalledTimes(1);
    });
  });

  describe("registerViewer", () => {
    test("sets loader and metadata on successful load", async () => {
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

      vi.mocked(loadOmeTiff).mockResolvedValue({
        data: mockLoader,
        metadata: mockMetadata,
      } as unknown as Awaited<ReturnType<typeof loadOmeTiff>>);

      render(
        <ViewerStoreProvider
          resourceId="success-viewer"
          url="https://example.com/image.tiff"
        >
          <div>Test</div>
        </ViewerStoreProvider>
      );

      await waitFor(() => {
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

      vi.mocked(loadOmeTiff).mockRejectedValue(mockError);

      render(
        <ViewerStoreProvider
          resourceId="error-viewer"
          url="https://example.com/bad-image.tiff"
        >
          <div>Test</div>
        </ViewerStoreProvider>
      );

      await waitFor(() => {
        expect(setError).toHaveBeenCalledWith(mockError);
        expect(setIsViewerLoading).toHaveBeenCalledWith(false);
      });
    });

    test("fetches offsets and passes them to loadOmeTiff when offsetsUrl is provided", async () => {
      const mockOffsets = [0, 1024, 2048];
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

      vi.mocked(loadOmeTiff).mockResolvedValue({
        data: [],
        metadata: {},
      } as unknown as Awaited<ReturnType<typeof loadOmeTiff>>);

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockOffsets),
      } as Response);

      render(
        <ViewerStoreProvider
          resourceId="offsets-viewer"
          url="https://example.com/image.ome.tiff"
          offsetsUrl="https://example.com/image.offsets.json"
        >
          <div>Test</div>
        </ViewerStoreProvider>,
      );

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith(
          "https://example.com/image.offsets.json",
        );
        expect(loadOmeTiff).toHaveBeenCalledWith(
          "https://example.com/image.ome.tiff",
          expect.objectContaining({ offsets: mockOffsets }),
        );
      });

      fetchSpy.mockRestore();
    });

    test("proceeds without offsets when offset fetch returns 404", async () => {
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

      vi.mocked(loadOmeTiff).mockResolvedValue({
        data: [],
        metadata: {},
      } as unknown as Awaited<ReturnType<typeof loadOmeTiff>>);

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: false,
        status: 404,
      } as Response);

      render(
        <ViewerStoreProvider
          resourceId="offsets-404-viewer"
          url="https://example.com/image.ome.tiff"
          offsetsUrl="https://example.com/image.offsets.json"
        >
          <div>Test</div>
        </ViewerStoreProvider>,
      );

      await waitFor(() => {
        expect(loadOmeTiff).toHaveBeenCalledWith(
          "https://example.com/image.ome.tiff",
          expect.objectContaining({ offsets: undefined }),
        );
      });

      fetchSpy.mockRestore();
    });

    test("proceeds without offsets on network error and logs a warning", async () => {
      const setLoader = vi.fn();
      const setIsViewerLoading = vi.fn();

      vi.mocked(createViewerStore).mockReturnValue({
        getState: vi.fn(() => ({
          setLoader,
          setMetadata: vi.fn(),
          setError: vi.fn(),
          setIsViewerLoading,
        })),
        setState: vi.fn(),
        subscribe: vi.fn(),
      } as unknown as ReturnType<typeof createViewerStore>);

      vi.mocked(loadOmeTiff).mockResolvedValue({
        data: [],
        metadata: {},
      } as unknown as Awaited<ReturnType<typeof loadOmeTiff>>);

      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockRejectedValue(new TypeError("Network error"));
      const warnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => {});

      render(
        <ViewerStoreProvider
          resourceId="offsets-network-error-viewer"
          url="https://example.com/image.ome.tiff"
          offsetsUrl="https://example.com/image.offsets.json"
        >
          <div>Test</div>
        </ViewerStoreProvider>,
      );

      await waitFor(() => {
        expect(warnSpy).toHaveBeenCalledWith(
          "Failed to fetch OME-TIFF offsets:",
          expect.any(TypeError),
        );
        expect(loadOmeTiff).toHaveBeenCalledWith(
          "https://example.com/image.ome.tiff",
          expect.objectContaining({ offsets: undefined }),
        );
      });

      fetchSpy.mockRestore();
      warnSpy.mockRestore();
    });

    test("discards malformed offsets JSON and proceeds without offsets", async () => {
      const setLoader = vi.fn();
      const setIsViewerLoading = vi.fn();

      vi.mocked(createViewerStore).mockReturnValue({
        getState: vi.fn(() => ({
          setLoader,
          setMetadata: vi.fn(),
          setError: vi.fn(),
          setIsViewerLoading,
        })),
        setState: vi.fn(),
        subscribe: vi.fn(),
      } as unknown as ReturnType<typeof createViewerStore>);

      vi.mocked(loadOmeTiff).mockResolvedValue({
        data: [],
        metadata: {},
      } as unknown as Awaited<ReturnType<typeof loadOmeTiff>>);

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ not: "an array" }),
      } as Response);

      const warnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => {});

      render(
        <ViewerStoreProvider
          resourceId="offsets-malformed-viewer"
          url="https://example.com/image.ome.tiff"
          offsetsUrl="https://example.com/image.offsets.json"
        >
          <div>Test</div>
        </ViewerStoreProvider>,
      );

      await waitFor(() => {
        expect(warnSpy).toHaveBeenCalledWith(
          "Invalid OME-TIFF offsets format, expected number[]",
        );
        expect(loadOmeTiff).toHaveBeenCalledWith(
          "https://example.com/image.ome.tiff",
          expect.objectContaining({ offsets: undefined }),
        );
      });

      fetchSpy.mockRestore();
      warnSpy.mockRestore();
    });

    test("does not fetch offsets when offsetsUrl is not provided", async () => {
      vi.mocked(createViewerStore).mockReturnValue({
        getState: vi.fn(() => ({
          setLoader: vi.fn(),
          setMetadata: vi.fn(),
          setError: vi.fn(),
          setIsViewerLoading: vi.fn(),
        })),
        setState: vi.fn(),
        subscribe: vi.fn(),
      } as unknown as ReturnType<typeof createViewerStore>);

      vi.mocked(loadOmeTiff).mockResolvedValue({
        data: [],
        metadata: {},
      } as unknown as Awaited<ReturnType<typeof loadOmeTiff>>);

      const fetchSpy = vi.spyOn(globalThis, "fetch");

      render(
        <ViewerStoreProvider
          resourceId="no-offsets-viewer"
          url="https://example.com/image.tiff"
        >
          <div>Test</div>
        </ViewerStoreProvider>,
      );

      await waitFor(() => {
        expect(loadOmeTiff).toHaveBeenCalled();
      });

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(loadOmeTiff).toHaveBeenCalledWith(
        "https://example.com/image.tiff",
        expect.objectContaining({ offsets: undefined }),
      );

      fetchSpy.mockRestore();
    });

    test("always sets isViewerLoading to false after load attempt", async () => {
      const setIsViewerLoading = vi.fn();

      vi.mocked(createViewerStore).mockReturnValue({
        getState: vi.fn(() => ({
          setLoader: vi.fn(),
          setMetadata: vi.fn(),
          setError: vi.fn(),
          setIsViewerLoading,
        })),
        setState: vi.fn(),
        subscribe: vi.fn(),
      } as unknown as ReturnType<typeof createViewerStore>);

      vi.mocked(loadOmeTiff).mockResolvedValue({
        data: [],
        metadata: {},
      } as unknown as Awaited<ReturnType<typeof loadOmeTiff>>);

      render(
        <ViewerStoreProvider
          resourceId="loading-viewer"
          url="https://example.com/image.tiff"
        >
          <div>Test</div>
        </ViewerStoreProvider>
      );

      await waitFor(() => {
        expect(setIsViewerLoading).toHaveBeenCalledWith(false);
      });
    });
  });

  describe("useViewerStore", () => {
    test("throws error when used outside ViewerStoreProvider", () => {
      // Suppress console.error for this test
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      expect(() => {
        renderHook(() => useViewerStore((state) => state));
      }).toThrow(
        "useViewerStoreContext must be used within ViewerStoreProvider"
      );

      consoleSpy.mockRestore();
    });

    test("returns selected state when used within provider", async () => {
      const mockState = {
        id: "test-viewer",
        isViewerLoading: false,
        error: null,
        setLoader: vi.fn(),
        setMetadata: vi.fn(),
        setError: vi.fn(),
        setIsViewerLoading: vi.fn(),
      };

      vi.mocked(createViewerStore).mockReturnValue({
        getState: vi.fn(() => mockState),
        setState: vi.fn(),
        subscribe: vi.fn((callback) => {
          // Immediately call with initial state
          callback(mockState, mockState);
          return () => {};
        }),
        getInitialState: vi.fn(() => mockState),
      } as unknown as ReturnType<typeof createViewerStore>);

      vi.mocked(loadOmeTiff).mockResolvedValue({
        data: [],
        metadata: {},
      } as unknown as Awaited<ReturnType<typeof loadOmeTiff>>);

      const wrapper = ({ children }: { children: ReactNode }) => (
        <ViewerStoreProvider
          resourceId="hook-test"
          url="https://example.com/image.tiff"
        >
          {children}
        </ViewerStoreProvider>
      );

      const { result } = renderHook(() => useViewerStore((state) => state.id), {
        wrapper,
      });

      expect(result.current).toBe("test-viewer");
    });
  });
});
