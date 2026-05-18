import { beforeEach, describe, expect, test, vi } from "vitest";

import mock from "./__mocks__";
import { loadConnectionLevel } from "../loadConnectionLevel";

const listObjectsClient = vi.fn();
vi.mock("../listObjectsClient", () => ({
  listObjectsClient: (...args: unknown[]) => listObjectsClient(...args),
}));

describe("loadConnectionLevel", () => {
  beforeEach(() => {
    listObjectsClient.mockReset();
  });

  test("composes the listing prefix from connectionConfig.prefix + urlPath", async () => {
    listObjectsClient.mockResolvedValueOnce({
      contents: [],
      commonPrefixes: [],
      isCapped: false,
    });

    await loadConnectionLevel({
      connectionConfig: mock.connectionConfig({ name: "conn", prefix: "scope" }),
      credentials: mock.credentials(),
      connectionName: "conn",
      urlPath: "sub/",
    });

    const opts = listObjectsClient.mock.calls[0][2] as { prefix?: string };
    expect(opts.prefix).toBe("scope/sub/");
  });

  test("builds a level tree from contents + commonPrefixes", async () => {
    listObjectsClient.mockResolvedValueOnce({
      contents: [{ Key: "scope/sub/file.tif" }],
      commonPrefixes: ["scope/sub/nested/"],
      isCapped: false,
    });

    const { nodes, isCapped } = await loadConnectionLevel({
      connectionConfig: mock.connectionConfig({ name: "conn", prefix: "scope" }),
      credentials: mock.credentials(),
      connectionName: "conn",
      urlPath: "sub",
    });

    expect(isCapped).toBe(false);
    expect(nodes.map((n) => n.name)).toEqual(["nested", "file.tif"]);
  });

  test("propagates isCapped from the underlying listing", async () => {
    listObjectsClient.mockResolvedValueOnce({
      contents: [],
      commonPrefixes: [],
      isCapped: true,
    });

    const { isCapped } = await loadConnectionLevel({
      connectionConfig: mock.connectionConfig({ prefix: "" }),
      credentials: mock.credentials(),
      connectionName: "conn",
      urlPath: "",
    });

    expect(isCapped).toBe(true);
  });

  test("forwards an AbortSignal to listObjectsClient", async () => {
    listObjectsClient.mockResolvedValueOnce({
      contents: [],
      commonPrefixes: [],
      isCapped: false,
    });

    const controller = new AbortController();
    await loadConnectionLevel({
      connectionConfig: mock.connectionConfig({ prefix: "" }),
      credentials: mock.credentials(),
      connectionName: "conn",
      urlPath: "",
      signal: controller.signal,
    });

    const opts = listObjectsClient.mock.calls[0][2] as { signal?: AbortSignal };
    expect(opts.signal).toBe(controller.signal);
  });
});
