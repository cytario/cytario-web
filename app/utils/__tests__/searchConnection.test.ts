import type { _Object } from "@aws-sdk/client-s3";
import { beforeEach, describe, expect, test, vi } from "vitest";

import mock from "./__mocks__";
import { searchConnection } from "../searchConnection";
import type { TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import type { Connection } from "~/utils/connectionsStore/useConnectionsStore";
import {
  __resetConnectionTreeStore,
  useConnectionTreeStore,
} from "~/utils/connectionsStore/useConnectionTreeStore";

const listObjectsClient = vi.fn();
vi.mock("../listObjects/listObjectsClient", () => ({
  listObjectsClient: (...args: unknown[]) => listObjectsClient(...args),
}));

function listing(contents: _Object[], commonPrefixes: string[]) {
  return { contents, commonPrefixes, isCapped: false };
}

function obj(key: string): _Object {
  return { Key: key } as _Object;
}

function connection(overrides: Record<string, unknown> = {}) {
  return {
    connectionConfig: mock.connectionConfig({
      id: "c1",
      name: "conn",
      prefix: "scope/",
      ...overrides,
    }),
    credentials: mock.credentials(),
    provider: {},
    ...overrides,
  } as Connection;
}

describe("searchConnection (BFS)", () => {
  beforeEach(() => {
    listObjectsClient.mockReset();
    __resetConnectionTreeStore();
  });

  test("returns empty tree when credentials are missing", async () => {
    const result = await searchConnection({
      connection: { ...connection(), credentials: null } as never,
      query: "foo",
    });
    expect(result.error).toBe(true);
    expect(result.node.children).toEqual([]);
  });

  test("finds files at the root level", async () => {
    listObjectsClient.mockResolvedValueOnce(
      listing([obj("scope/data.tif"), obj("scope/other.txt")], []),
    );

    const result = await searchConnection({ connection: connection(), query: "data" });

    expect(listObjectsClient).toHaveBeenCalledTimes(1);
    expect(result.node.children?.map((c) => c.name)).toEqual(["data.tif"]);
  });

  test("descends into subdirectories to find deeper matches", async () => {
    listObjectsClient
      .mockResolvedValueOnce(listing([], ["scope/sub/"])) // root level
      .mockResolvedValueOnce(listing([obj("scope/sub/match.czi")], [])); // sub level

    const result = await searchConnection({ connection: connection(), query: "match" });

    expect(listObjectsClient).toHaveBeenCalledTimes(2);
    expect(result.node.children?.[0].name).toBe("sub");
    expect(result.node.children?.[0].children?.[0].name).toBe("match.czi");
  });

  test("matches leaf directory name without descending into interior", async () => {
    listObjectsClient.mockResolvedValueOnce(
      listing([obj("scope/data.tif")], ["scope/experiment.zarr/"]),
    );

    const result = await searchConnection({ connection: connection(), query: "experiment" });

    expect(listObjectsClient).toHaveBeenCalledTimes(1);
    const leaf = result.node.children?.find((c) => c.name === "experiment.zarr");
    expect(leaf).toBeDefined();
    expect(leaf?.type).toBe("file");
  });

  test("matches regular directory name without descending into it", async () => {
    listObjectsClient.mockResolvedValueOnce(listing([], ["scope/omero-annotation-migration/"]));

    const result = await searchConnection({ connection: connection(), query: "omero" });

    expect(listObjectsClient).toHaveBeenCalledTimes(1);
    const dir = result.node.children?.find((c) => c.name === "omero-annotation-migration");
    expect(dir).toBeDefined();
    expect(dir?.type).toBe("directory");
  });

  test("does not descend into leaf directories", async () => {
    listObjectsClient.mockResolvedValueOnce(listing([], ["scope/data.zarr/", "scope/sub/"]));

    await searchConnection({ connection: connection(), query: "anything" });

    // Only root + sub (no call for data.zarr interior)
    expect(listObjectsClient).toHaveBeenCalledTimes(2);
    const prefixes = listObjectsClient.mock.calls.map((c) => (c[2] as { prefix?: string }).prefix);
    expect(prefixes).toContain("scope/");
    expect(prefixes).toContain("scope/sub/");
    expect(prefixes).not.toContain("scope/data.zarr/");
  });

  test("skips companion directories", async () => {
    // .vsi file + its companion dir _data_
    listObjectsClient.mockResolvedValueOnce(listing([obj("scope/data.vsi")], ["scope/_data_/"]));

    await searchConnection({ connection: connection(), query: "data" });

    expect(listObjectsClient).toHaveBeenCalledTimes(1);
    const prefixes = listObjectsClient.mock.calls.map((c) => (c[2] as { prefix?: string }).prefix);
    expect(prefixes).not.toContain("scope/_data_/");
  });

  test("processes sibling directories in parallel (one Promise.all round per BFS level)", async () => {
    listObjectsClient
      .mockResolvedValueOnce(listing([], ["scope/a/", "scope/b/", "scope/c/"]))
      .mockResolvedValueOnce(listing([obj("scope/a/match.tif")], []))
      .mockResolvedValueOnce(listing([obj("scope/b/match.tif")], []))
      .mockResolvedValueOnce(listing([obj("scope/c/match.tif")], []));

    const result = await searchConnection({ connection: connection(), query: "match" });

    expect(listObjectsClient).toHaveBeenCalledTimes(4);
    expect(result.node.children?.map((c) => c.name)).toEqual(["a", "b", "c"]);
  });

  test("surfaces CORS errors", async () => {
    const { CorsLikelyError } = await import("~/utils/signedFetch");
    listObjectsClient.mockRejectedValueOnce(new CorsLikelyError("host", "origin"));

    const result = await searchConnection({ connection: connection(), query: "x" });

    expect(result.error).toBe(true);
    expect(result.corsBlocked).toBe(true);
  });

  test("forwards AbortSignal", async () => {
    listObjectsClient.mockResolvedValueOnce(listing([], []));
    const controller = new AbortController();

    await searchConnection({
      connection: connection(),
      query: "x",
      signal: controller.signal,
    });

    const opts = listObjectsClient.mock.calls[0][2] as { signal?: AbortSignal };
    expect(opts.signal).toBe(controller.signal);
  });

  test("propagates isCapped when BFS exceeds MAX_DIRS", async () => {
    const dirs = Array.from({ length: 600 }, (_, i) => `scope/d${i}/`);
    listObjectsClient.mockResolvedValueOnce(listing([], dirs));
    listObjectsClient.mockResolvedValue(listing([], []));

    const result = await searchConnection({ connection: connection(), query: "x" });

    expect(result.isCapped).toBe(true);
  });

  test("propagates isCapped when S3 listing returns isCapped", async () => {
    listObjectsClient
      .mockResolvedValueOnce(listing([], ["scope/sub/"]))
      .mockResolvedValueOnce({ contents: [], commonPrefixes: [], isCapped: true });

    const result = await searchConnection({ connection: connection(), query: "x" });

    expect(result.isCapped).toBe(true);
  });

  test("reads levels through the shared cache — repeated search fetches once", async () => {
    listObjectsClient.mockResolvedValue(listing([obj("scope/data.tif")], []));

    await searchConnection({ connection: connection(), query: "data" });
    await searchConnection({ connection: connection(), query: "data" });

    expect(listObjectsClient).toHaveBeenCalledTimes(1);
  });

  test("search warm-up serves a later browse loadLevel without refetching", async () => {
    listObjectsClient.mockResolvedValue(listing([obj("scope/data.tif")], []));

    await searchConnection({ connection: connection(), query: "data" });
    const { nodes } = await useConnectionTreeStore.getState().loadLevel({
      connectionConfig: connection().connectionConfig,
      credentials: mock.credentials(),
      connectionId: "c1",
      connectionName: "conn",
      urlPath: "",
    });

    expect(listObjectsClient).toHaveBeenCalledTimes(1);
    expect(nodes.map((n) => n.name)).toEqual(["data.tif"]);
  });

  test("extension filter with empty query walks all dirs and returns pruned tree", async () => {
    listObjectsClient
      .mockResolvedValueOnce(listing([obj("scope/data.txt")], ["scope/sub/", "scope/empty/"]))
      .mockResolvedValueOnce(listing([obj("scope/sub/match.parquet")], []))
      .mockResolvedValueOnce(listing([obj("scope/empty/nothing.txt")], []));

    const result = await searchConnection({
      connection: connection(),
      query: "",
      filters: { extensions: ["parquet"] },
    });

    expect(listObjectsClient).toHaveBeenCalledTimes(3);
    const allNames: string[] = [];
    function collectNames(nodes: TreeNode[]) {
      for (const n of nodes) {
        allNames.push(n.name);
        if (n.children) collectNames(n.children);
      }
    }
    collectNames(result.node.children ?? []);
    expect(allNames).toContain("match.parquet");
    expect(allNames).not.toContain("data.txt");
    expect(allNames).not.toContain("nothing.txt");
    expect(allNames).not.toContain("empty");
  });
});
