import { beforeEach, describe, expect, test, vi } from "vitest";

import mock from "./__mocks__";
import { enrichDirectoryPreviews } from "../enrichDirectoryPreviews";
import type { TreeNode } from "~/components/DirectoryView/buildDirectoryTree";

const listObjectsClient = vi.fn();
vi.mock("../listObjects/listObjectsClient", () => ({
  listObjectsClient: (...args: unknown[]) => listObjectsClient(...args),
}));

function makeDirNode(name: string, pathName: string): TreeNode {
  return {
    id: `conn-id/${pathName}`,
    connectionId: "conn-id",
    connectionName: "conn",
    type: "directory",
    name,
    pathName,
    children: [],
    hasChildren: true,
    isLeaf: false,
    loadState: "idle",
  };
}

describe("enrichDirectoryPreviews", () => {
  beforeEach(() => {
    listObjectsClient.mockReset();
  });

  test("returns a map of node id to first imageable object", async () => {
    const nodes = [makeDirNode("dir-a", "dir-a"), makeDirNode("dir-b", "dir-b")];

    listObjectsClient
      .mockResolvedValueOnce({
        contents: [{ Key: "scope/dir-a/image.tif" }],
        commonPrefixes: [],
        isCapped: false,
      })
      .mockResolvedValueOnce({
        contents: [{ Key: "scope/dir-b/photo.png" }],
        commonPrefixes: [],
        isCapped: false,
      });

    const result = await enrichDirectoryPreviews(nodes, {
      connectionConfig: mock.connectionConfig({ prefix: "scope" }),
      credentials: mock.credentials(),
      connectionId: "conn-id",
    });

    expect(result["conn-id/dir-a"]?.Key).toBe("scope/dir-a/image.tif");
    expect(result["conn-id/dir-b"]?.Key).toBe("scope/dir-b/photo.png");
  });

  test("omits directories with no imageable objects from the map", async () => {
    const nodes = [makeDirNode("dir-a", "dir-a")];

    listObjectsClient.mockResolvedValueOnce({
      contents: [{ Key: "scope/dir-a/data.csv" }],
      commonPrefixes: [],
      isCapped: false,
    });

    const result = await enrichDirectoryPreviews(nodes, {
      connectionConfig: mock.connectionConfig({ prefix: "scope" }),
      credentials: mock.credentials(),
      connectionId: "conn-id",
    });

    expect(result["conn-id/dir-a"]).toBeUndefined();
  });

  test("skips directories that already have _Object", async () => {
    const nodes: TreeNode[] = [
      {
        ...makeDirNode("dir-a", "dir-a"),
        _Object: { Key: "scope/dir-a/existing.tif" } as never,
      },
      makeDirNode("dir-b", "dir-b"),
    ];

    listObjectsClient.mockResolvedValueOnce({
      contents: [{ Key: "scope/dir-b/image.tif" }],
      commonPrefixes: [],
      isCapped: false,
    });

    const result = await enrichDirectoryPreviews(nodes, {
      connectionConfig: mock.connectionConfig({ prefix: "scope" }),
      credentials: mock.credentials(),
      connectionId: "conn-id",
    });

    expect(listObjectsClient).toHaveBeenCalledTimes(1);
    expect(result["conn-id/dir-a"]).toBeUndefined();
    expect(result["conn-id/dir-b"]?.Key).toBe("scope/dir-b/image.tif");
  });

  test("returns empty map when there are no directory nodes", async () => {
    const nodes = [
      {
        ...makeDirNode("file.tif", "file.tif"),
        type: "file" as const,
      },
    ];

    const result = await enrichDirectoryPreviews(nodes, {
      connectionConfig: mock.connectionConfig({ prefix: "scope" }),
      credentials: mock.credentials(),
      connectionId: "conn-id",
    });

    expect(listObjectsClient).not.toHaveBeenCalled();
    expect(result).toEqual({});
  });

  test("uses recursive listing with findFirst to short-circuit on first image", async () => {
    const nodes = [makeDirNode("dir-a", "dir-a")];

    listObjectsClient.mockResolvedValueOnce({
      contents: [{ Key: "scope/dir-a/image.tif" }],
      commonPrefixes: [],
      isCapped: false,
    });

    await enrichDirectoryPreviews(nodes, {
      connectionConfig: mock.connectionConfig({ prefix: "scope" }),
      credentials: mock.credentials(),
      connectionId: "conn-id",
    });

    const opts = listObjectsClient.mock.calls[0][2] as {
      recursive?: boolean;
      findFirst?: (obj: { Key?: string }) => boolean;
    };
    expect(opts.recursive).toBe(true);
    expect(typeof opts.findFirst).toBe("function");
  });

  test("swallows errors and omits the directory from the map", async () => {
    const nodes = [makeDirNode("dir-a", "dir-a")];

    listObjectsClient.mockRejectedValueOnce(new Error("AccessDenied"));

    const result = await enrichDirectoryPreviews(nodes, {
      connectionConfig: mock.connectionConfig({ prefix: "scope" }),
      credentials: mock.credentials(),
      connectionId: "conn-id",
    });

    expect(result).toEqual({});
  });
});
