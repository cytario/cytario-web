import { Archive, File, Folder } from "lucide-react";

import {
  findOriginalNode,
  toDesignTreeNodes,
} from "../toDesignTreeNodes";
import { TreeNode } from "~/components/DirectoryView/buildDirectoryTree";

const makeNode = (
  overrides: Partial<TreeNode> & Pick<TreeNode, "name">,
): TreeNode => ({
  connectionName: "aws-test-bucket",
  provider: "aws",
  bucketName: "test-bucket",
  type: "file",
  ...overrides,
});

describe("toDesignTreeNodes", () => {
  test("converts a flat list of file nodes", () => {
    const nodes: TreeNode[] = [
      makeNode({ name: "data.parquet", pathName: "data.parquet", type: "file" }),
      makeNode({ name: "other.parquet", pathName: "other.parquet", type: "file" }),
    ];

    const result = toDesignTreeNodes(nodes);

    expect(result).toEqual([
      { id: "data.parquet", name: "data.parquet", icon: File },
      { id: "other.parquet", name: "other.parquet", icon: File },
    ]);
  });

  test("converts nested directory structure preserving hierarchy", () => {
    const nodes: TreeNode[] = [
      makeNode({
        name: "results",
        pathName: "results/",
        type: "directory",
        children: [
          makeNode({
            name: "output.parquet",
            pathName: "results/output.parquet",
            type: "file",
          }),
        ],
      }),
    ];

    const result = toDesignTreeNodes(nodes);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: "results/",
      name: "results",
      icon: Folder,
      children: [
        { id: "results/output.parquet", name: "output.parquet", icon: File },
      ],
    });
  });

  test("assigns bucket icon for bucket nodes", () => {
    const nodes: TreeNode[] = [
      makeNode({ name: "my-bucket", pathName: "my-bucket", type: "bucket" }),
    ];

    const result = toDesignTreeNodes(nodes);

    expect(result[0].icon).toBe(Archive);
  });

  test("uses name as id when pathName is undefined", () => {
    const nodes: TreeNode[] = [
      makeNode({ name: "unnamed-file", type: "file" }),
    ];

    const result = toDesignTreeNodes(nodes);

    expect(result[0].id).toBe("unnamed-file");
  });

  test("omits children property for leaf nodes", () => {
    const nodes: TreeNode[] = [
      makeNode({ name: "leaf.parquet", pathName: "leaf.parquet", type: "file" }),
    ];

    const result = toDesignTreeNodes(nodes);

    expect(result[0]).not.toHaveProperty("children");
  });

  test("returns empty array for empty input", () => {
    expect(toDesignTreeNodes([])).toEqual([]);
  });
});

describe("findOriginalNode", () => {
  const tree: TreeNode[] = [
    makeNode({
      name: "analysis",
      pathName: "analysis/",
      type: "directory",
      children: [
        makeNode({
          name: "cells.parquet",
          pathName: "analysis/cells.parquet",
          type: "file",
        }),
        makeNode({
          name: "nested",
          pathName: "analysis/nested/",
          type: "directory",
          children: [
            makeNode({
              name: "deep.parquet",
              pathName: "analysis/nested/deep.parquet",
              type: "file",
            }),
          ],
        }),
      ],
    }),
    makeNode({
      name: "root.parquet",
      pathName: "root.parquet",
      type: "file",
    }),
  ];

  test("finds a root-level node by pathName", () => {
    const found = findOriginalNode(tree, "root.parquet");
    expect(found?.name).toBe("root.parquet");
  });

  test("finds a nested node by pathName", () => {
    const found = findOriginalNode(tree, "analysis/cells.parquet");
    expect(found?.name).toBe("cells.parquet");
  });

  test("finds a deeply nested node by pathName", () => {
    const found = findOriginalNode(tree, "analysis/nested/deep.parquet");
    expect(found?.name).toBe("deep.parquet");
  });

  test("returns undefined for non-existent id", () => {
    const found = findOriginalNode(tree, "nonexistent");
    expect(found).toBeUndefined();
  });

  test("returns undefined for empty tree", () => {
    const found = findOriginalNode([], "anything");
    expect(found).toBeUndefined();
  });
});
