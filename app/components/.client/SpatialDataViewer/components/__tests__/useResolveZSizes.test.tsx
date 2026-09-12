import { render, waitFor } from "@testing-library/react";
import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";

import { useResolveZSizes, isZBearing } from "../useResolveZSizes";

const loadOmeZarrMultiscalesData = vi.fn();

vi.mock("@spatialdata/avivatorish", () => ({
  loadOmeZarrMultiscalesData: (...args: unknown[]) => loadOmeZarrMultiscalesData(...args),
  getVivSelectionAxisSizes: (labels: string[], shape: number[]) => {
    const sizes: Record<string, number> = {};
    for (let i = 0; i < Math.min(labels.length, shape.length); i += 1) {
      const name = labels[i]?.toLowerCase();
      if (name === "z" || name === "c" || name === "t") {
        if (typeof shape[i] === "number" && shape[i] > 0) sizes[name] = shape[i];
      }
    }
    return sizes;
  },
}));

let setElementZSize: ReturnType<typeof vi.fn>;
let elements: Record<string, Record<string, unknown>>;

const Harness = () => {
  useResolveZSizes(elements as never, (id, zSize) => setElementZSize(id, zSize));
  return null;
};

const renderHook = () => render(<Harness />);

beforeEach(() => {
  setElementZSize = vi.fn();
  elements = {};
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("useResolveZSizes", () => {
  test("populates zSize for a z-bearing element from the mocked loader", async () => {
    elements["image:z_image"] = {
      elementType: "image",
      elementKey: "z_image",
      isVisible: true,
      opacity: 1,
      getStore: () => ({ store: "z_image" }),
    };
    loadOmeZarrMultiscalesData.mockResolvedValue([
      { labels: ["c", "z", "y", "x"], shape: [2, 4, 64, 64] },
    ]);

    renderHook();

    await waitFor(() => {
      expect(setElementZSize).toHaveBeenCalledWith("image:z_image", 4);
    });
  });

  test("leaves zSize undefined for a 2D element (no z axis in loader labels)", async () => {
    elements["image:flat"] = {
      elementType: "image",
      elementKey: "flat",
      isVisible: true,
      opacity: 1,
      getStore: () => ({ store: "flat" }),
    };
    loadOmeZarrMultiscalesData.mockResolvedValue([{ labels: ["c", "y", "x"], shape: [3, 64, 64] }]);

    renderHook();

    await waitFor(() => {
      expect(loadOmeZarrMultiscalesData).toHaveBeenCalledTimes(1);
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(setElementZSize).not.toHaveBeenCalled();
  });

  test("a failed load leaves zSize undefined without throwing", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    elements["image:broken"] = {
      elementType: "image",
      elementKey: "broken",
      isVisible: true,
      opacity: 1,
      getStore: () => ({ store: "broken" }),
    };
    elements["image:healthy"] = {
      elementType: "image",
      elementKey: "healthy",
      isVisible: true,
      opacity: 1,
      getStore: () => ({ store: "healthy" }),
    };
    loadOmeZarrMultiscalesData.mockImplementation(({ store }: { store: { store: string } }) =>
      store.store === "broken"
        ? Promise.reject(new Error("loader failure"))
        : Promise.resolve([{ labels: ["z", "y", "x"], shape: [3, 8, 8] }]),
    );

    renderHook();

    await waitFor(() => {
      expect(setElementZSize).toHaveBeenCalledWith("image:healthy", 3);
    });
    expect(setElementZSize).not.toHaveBeenCalledWith("image:broken", expect.anything());
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("broken"), expect.any(Error));
  });

  test("unmount before resolution does not write", async () => {
    elements["image:slow"] = {
      elementType: "image",
      elementKey: "slow",
      isVisible: true,
      opacity: 1,
      getStore: () => ({ store: "slow" }),
    };
    let resolveLoader: (value: unknown) => void = () => {};
    loadOmeZarrMultiscalesData.mockReturnValue(
      new Promise((resolve) => {
        resolveLoader = resolve;
      }),
    );

    const { unmount } = renderHook();
    unmount();

    resolveLoader([{ labels: ["z", "y", "x"], shape: [3, 8, 8] }]);
    await new Promise((r) => setTimeout(r, 10));

    expect(setElementZSize).not.toHaveBeenCalled();
  });

  test("skips elements that already have a zSize", () => {
    elements["image:resolved"] = {
      elementType: "image",
      elementKey: "resolved",
      isVisible: true,
      opacity: 1,
      zSize: 5,
      getStore: () => ({ store: "resolved" }),
    };

    renderHook();

    expect(loadOmeZarrMultiscalesData).not.toHaveBeenCalled();
  });
});

describe("isZBearing", () => {
  test("true only for raster kinds with a resolved plane count above one", () => {
    expect(isZBearing({ elementType: "image", zSize: 4 })).toBe(true);
    expect(isZBearing({ elementType: "labels", zSize: 2 })).toBe(true);
    expect(isZBearing({ elementType: "image", zSize: 1 })).toBe(false);
    expect(isZBearing({ elementType: "image" })).toBe(false);
    expect(isZBearing({ elementType: "points", zSize: 4 })).toBe(false);
    expect(isZBearing({ elementType: "shapes", zSize: 4 })).toBe(false);
  });
});
