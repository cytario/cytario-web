import { beforeEach, describe, expect, test, vi } from "vitest";

import type { TreeNode } from "../buildDirectoryTree";
import { onExpand } from "../onExpand";

const loadLevelMock = vi.hoisted(() => vi.fn());

vi.mock("~/utils/loadConnectionLevel", () => ({
  loadConnectionLevel: loadLevelMock,
}));

vi.mock("~/utils/connectionsStore/useConnectionsStore", () => {
  const state = {
    connections: {
      pub: {
        connectionConfig: { id: "pub", name: "public-conn", bucketName: "b" },
        credentials: null,
        provider: { isPublic: true },
      },
      broken: {
        connectionConfig: { id: "broken", name: "broken-conn", bucketName: "b" },
        credentials: null,
        provider: { isPublic: false },
      },
    },
  };
  const useConnectionsStore = ((selector: (s: typeof state) => unknown) =>
    selector(state)) as unknown as {
    getState: () => typeof state;
    (selector: (s: typeof state) => unknown): unknown;
  };
  useConnectionsStore.getState = () => state;
  return { useConnectionsStore };
});

function dirNode(connectionId: string, name: string): TreeNode {
  return {
    id: `${connectionId}/${name}/`,
    connectionId,
    connectionName: "conn",
    type: "directory",
    name,
    pathName: `${name}/`,
    isLeaf: false,
  };
}

describe("onExpand", () => {
  beforeEach(() => {
    loadLevelMock.mockReset();
  });

  test("lists a public (credential-less) connection", async () => {
    const nodes = [{ id: "pub/a/" }];
    loadLevelMock.mockResolvedValue({ nodes, isCapped: false });

    const result = await onExpand(dirNode("pub", "root"));

    expect(loadLevelMock).toHaveBeenCalledTimes(1);
    expect(loadLevelMock.mock.calls[0][0]).toMatchObject({
      connectionId: "pub",
      credentials: null,
    });
    expect(result).toBe(nodes);
  });

  test("returns empty for a non-public connection without credentials", async () => {
    const result = await onExpand(dirNode("broken", "root"));

    expect(loadLevelMock).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });
});
