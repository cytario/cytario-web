import { describe, expect, test } from "vitest";

import { type TreeNode } from "../../DirectoryView/buildDirectoryTree";
import { nodeToTrail } from "../breadcrumbTrail";

const node = (over: Partial<TreeNode>): TreeNode => ({
  id: "",
  connectionName: "",
  pathName: "",
  name: "",
  type: "directory",
  children: [],
  ...over,
});

describe("nodeToTrail", () => {
  test("static node (no connection) is a single crumb", () => {
    const n = node({ id: "virtual/Favorites", name: "Favorites" });
    expect(nodeToTrail(n)).toEqual([n]);
  });

  test("connection root is a single crumb", () => {
    const n = node({
      id: "bucket/",
      connectionId: "bucket",
      connectionName: "bucket",
      name: "bucket",
      type: "bucket",
    });
    expect(nodeToTrail(n)).toEqual([n]);
  });

  test("nested path splits into bucket → ancestors → leaf", () => {
    const leaf = node({
      id: "bucket/a/b",
      connectionId: "bucket",
      connectionName: "bucket",
      pathName: "a/b",
      name: "b",
    });
    const trail = nodeToTrail(leaf);

    expect(trail.map((t) => t.name)).toEqual(["bucket", "a", "b"]);
    expect(trail.map((t) => t.id)).toEqual(["bucket/", "bucket/a", "bucket/a/b"]);
    expect(trail[trail.length - 1]).toBe(leaf);
  });
});
