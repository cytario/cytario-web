import { beforeEach, describe, expect, test, vi } from "vitest";

// idb-keyval against happy-dom: mock the module so tests assert call shapes
// (metadata-only hydrate) rather than IndexedDB behavior.
const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  keys: vi.fn(),
}));

vi.mock("idb-keyval", () => ({
  createStore: vi.fn(() => ({})),
  get: mocks.get,
  set: mocks.set,
  del: mocks.del,
  keys: mocks.keys,
}));

import { useFileStore } from "../useFileStore";

describe("useFileStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useFileStore.setState({ files: {} });
  });

  test("hydrate reads only the size record, never file payloads", async () => {
    mocks.get.mockResolvedValueOnce({ "file-a": 100, "file-b": 200 }); // __sizes__
    mocks.keys.mockResolvedValueOnce(["file-a", "file-b", "__sizes__"]);

    await useFileStore.getState().hydrate();

    expect(mocks.get).toHaveBeenCalledTimes(1);
    expect(mocks.get).toHaveBeenCalledWith("__sizes__", expect.anything());
    const files = useFileStore.getState().files;
    expect(Object.keys(files).sort()).toEqual(["file-a", "file-b"]);
    expect(files["file-a"]?.progress).toEqual({ loaded: 100, total: 100, percentage: 100 });
  });

  test("hydrate yields an empty cache when the size record is absent", async () => {
    mocks.get.mockResolvedValueOnce(undefined); // no __sizes__ ever written
    mocks.keys.mockResolvedValueOnce(["file-a"]); // legacy payload-only cache

    await useFileStore.getState().hydrate();

    expect(useFileStore.getState().files).toEqual({});
  });

  test("saveFile persists payload and records the size", async () => {
    mocks.get.mockResolvedValue({}); // readSizes in saveFile
    const bytes = new Uint8Array([1, 2, 3]);

    await useFileStore.getState().saveFile("file-a", bytes);

    expect(mocks.set).toHaveBeenCalledTimes(2);
    expect(mocks.set).toHaveBeenNthCalledWith(1, "file-a", bytes, expect.anything());
    expect(mocks.set).toHaveBeenNthCalledWith(2, "__sizes__", { "file-a": 3 }, expect.anything());
    expect(useFileStore.getState().hasFile("file-a")).toBe(true);
  });

  test("deleteFile removes the payload and the size record entry", async () => {
    mocks.get.mockResolvedValue({ "file-a": 3, "file-b": 4 });

    await useFileStore.getState().deleteFile("file-a");

    expect(mocks.del).toHaveBeenCalledWith("file-a", expect.anything());
    expect(mocks.set).toHaveBeenCalledWith("__sizes__", { "file-b": 4 }, expect.anything());
    expect(useFileStore.getState().hasFile("file-a")).toBe(false);
  });
});
