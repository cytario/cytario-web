import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { TreeNode } from "../buildDirectoryTree";
import { useLazyTreeNodes } from "../useLazyTreeNodes";
import mock from "~/utils/__tests__/__mocks__";
import { useConnectionsStore } from "~/utils/connectionsStore/useConnectionsStore";

const emitSpy = vi.fn();
vi.mock("~/toast-bridge", () => ({
  toastBridge: { emit: (...args: unknown[]) => emitSpy(...args) },
  toToastVariant: (s: string) => (s === "warning" ? "info" : s),
}));

const listObjectsClient = vi.fn();
vi.mock("~/utils/listObjectsClient", () => ({
  listObjectsClient: (...args: unknown[]) => listObjectsClient(...args),
}));

const dir = (overrides: Partial<TreeNode>): TreeNode => ({
  id: "conn/sub/",
  connectionName: "conn",
  type: "directory",
  name: "sub",
  pathName: "sub/",
  children: [],
  hasChildren: true,
  isLeaf: false,
  loadState: "idle",
  ...overrides,
});

const fileLeaf = (overrides: Partial<TreeNode>): TreeNode => ({
  id: "conn/leaf.tif",
  connectionName: "conn",
  type: "file",
  name: "leaf.tif",
  pathName: "leaf.tif",
  children: [],
  isLeaf: true,
  ...overrides,
});

const seedConnection = (name = "conn") => {
  useConnectionsStore
    .getState()
    .setConnections([mock.connectionConfig({ name, prefix: "" })], { [name]: mock.credentials() });
};

describe("useLazyTreeNodes", () => {
  beforeEach(() => {
    listObjectsClient.mockReset();
    emitSpy.mockReset();
    useConnectionsStore.setState({ connections: {} });
    seedConnection();
  });

  afterEach(() => {
    useConnectionsStore.setState({ connections: {} });
  });

  test("does not prefetch — calls listObjectsClient only on explicit loadChildren", async () => {
    listObjectsClient.mockResolvedValue({ contents: [], commonPrefixes: [], isCapped: false });

    const initialNodes = [
      dir({ id: "conn/a/", name: "a", pathName: "a/" }),
      dir({ id: "conn/b/", name: "b", pathName: "b/" }),
      fileLeaf({}),
    ];

    renderHook(() => useLazyTreeNodes(initialNodes));

    await new Promise((r) => setTimeout(r, 20));
    expect(listObjectsClient).not.toHaveBeenCalled();
  });

  test("loadChildren replaces a node's children and marks it loaded", async () => {
    listObjectsClient.mockResolvedValueOnce({
      contents: [{ Key: "sub/x.tif" }],
      commonPrefixes: [],
      isCapped: false,
    });

    const initial = [dir({})];
    const { result } = renderHook(() => useLazyTreeNodes(initial));

    await act(async () => {
      await result.current.loadChildren(initial[0]);
    });

    expect(result.current.nodes[0].loadState).toBe("loaded");
    expect(result.current.nodes[0].children).toHaveLength(1);
    expect(result.current.nodes[0].children![0].name).toBe("x.tif");
  });

  test("dedupes concurrent loadChildren calls for the same node", async () => {
    let resolve!: (value: unknown) => void;
    listObjectsClient.mockReturnValueOnce(
      new Promise((res) => {
        resolve = res;
      }),
    );

    const initial = [dir({})];
    const { result } = renderHook(() => useLazyTreeNodes(initial));

    await act(async () => {
      void result.current.loadChildren(initial[0]);
      void result.current.loadChildren(initial[0]);
    });

    expect(listObjectsClient).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolve({ contents: [], commonPrefixes: [], isCapped: false });
    });
  });

  test("skips fetch for leaf nodes", async () => {
    listObjectsClient.mockResolvedValue({ contents: [], commonPrefixes: [], isCapped: false });

    const { result } = renderHook(() => useLazyTreeNodes([fileLeaf({})]));
    await act(async () => {
      await result.current.loadChildren(fileLeaf({}));
    });

    expect(listObjectsClient).not.toHaveBeenCalled();
  });

  test("emits a warning toast when listObjectsClient reports isCapped", async () => {
    listObjectsClient.mockResolvedValueOnce({
      contents: [{ Key: "sub/x.tif" }],
      commonPrefixes: [],
      isCapped: true,
    });

    const initial = [dir({})];
    const { result } = renderHook(() => useLazyTreeNodes(initial));

    await act(async () => {
      await result.current.loadChildren(initial[0]);
    });

    expect(emitSpy).toHaveBeenCalledTimes(1);
    expect(emitSpy.mock.calls[0][0]).toMatchObject({
      message: expect.stringMatching(/truncated/i),
    });
  });

  test("does not emit a toast when isCapped is false", async () => {
    listObjectsClient.mockResolvedValueOnce({
      contents: [],
      commonPrefixes: [],
      isCapped: false,
    });

    const initial = [dir({})];
    const { result } = renderHook(() => useLazyTreeNodes(initial));

    await act(async () => {
      await result.current.loadChildren(initial[0]);
    });

    expect(emitSpy).not.toHaveBeenCalled();
  });

  test("stale resolve from previous cohort does not overwrite new tree", async () => {
    let resolveFirst!: (value: unknown) => void;
    listObjectsClient.mockReturnValueOnce(
      new Promise((res) => {
        resolveFirst = res;
      }),
    );

    const cohortA = [dir({ id: "conn/sub/", name: "sub", pathName: "sub/" })];
    const cohortB = [
      dir({
        id: "conn/sub/",
        name: "sub",
        pathName: "sub/",
        loadState: "idle",
        children: [],
      }),
    ];

    const { result, rerender } = renderHook(({ nodes }) => useLazyTreeNodes(nodes), {
      initialProps: { nodes: cohortA },
    });

    await act(async () => {
      void result.current.loadChildren(cohortA[0]).catch(() => {});
    });

    rerender({ nodes: cohortB });

    await act(async () => {
      resolveFirst({
        contents: [{ Key: "sub/stale.tif" }],
        commonPrefixes: [],
        isCapped: false,
      });
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.nodes[0].loadState).toBe("idle");
    expect(result.current.nodes[0].children).toEqual([]);
  });

  test("aborted cohort suppresses isCapped toast", async () => {
    let resolveFirst!: (value: unknown) => void;
    listObjectsClient.mockReturnValueOnce(
      new Promise((res) => {
        resolveFirst = res;
      }),
    );

    const cohortA = [dir({})];
    const cohortB = [dir({})];

    const { result, rerender } = renderHook(({ nodes }) => useLazyTreeNodes(nodes), {
      initialProps: { nodes: cohortA },
    });

    await act(async () => {
      void result.current.loadChildren(cohortA[0]).catch(() => {});
    });

    rerender({ nodes: cohortB });

    await act(async () => {
      resolveFirst({ contents: [], commonPrefixes: [], isCapped: true });
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(emitSpy).not.toHaveBeenCalled();
  });

  test("marks loadState=error on failed listing", async () => {
    listObjectsClient.mockRejectedValueOnce(new Error("boom"));

    const initial = [dir({})];
    const { result } = renderHook(() => useLazyTreeNodes(initial));

    await act(async () => {
      await result.current.loadChildren(initial[0]).catch(() => {});
    });

    expect(result.current.nodes[0].loadState).toBe("error");
  });

  test("propagates connectionConfig.prefix into the listing prefix", async () => {
    useConnectionsStore
      .getState()
      .setConnections([mock.connectionConfig({ name: "conn", prefix: "scope" })], {
        conn: mock.credentials(),
      });

    listObjectsClient.mockResolvedValueOnce({
      contents: [],
      commonPrefixes: [],
      isCapped: false,
    });

    const initial = [dir({ pathName: "sub/" })];
    const { result } = renderHook(() => useLazyTreeNodes(initial));

    await act(async () => {
      await result.current.loadChildren(initial[0]);
    });

    const opts = listObjectsClient.mock.calls[0][2] as { prefix: string };
    expect(opts.prefix).toBe("scope/sub/");
  });
});
