import type { ColumnFiltersState } from "@tanstack/react-table";
import { describe, expect, test } from "vitest";

import type { TreeNode } from "../buildDirectoryTree";
import { filterHiddenNodes, filterNodes } from "../filterNodes";
import type { ColumnConfig } from "~/components/Table/types";

const makeNode = (overrides: Partial<TreeNode> = {}): TreeNode => ({
  id: "file.csv",
  connectionName: "aws-bucket",
  name: "file.csv",
  type: "file",


  pathName: "file.csv",
  children: [],
  ...overrides,
});

const fileColumns: ColumnConfig[] = [
  { id: "name", header: "Name", size: 200, enableColumnFilter: true, filterType: "text" },
  { id: "file_type", header: "Type", size: 100, enableColumnFilter: true, filterType: "select" },
];

const bucketColumns: ColumnConfig[] = [
  { id: "name", header: "Name", size: 200, enableColumnFilter: true, filterType: "text" },
  { id: "provider", header: "Provider", size: 100, enableColumnFilter: true, filterType: "select" },
];

describe("filterHiddenNodes", () => {
  test("removes dot-prefixed files when showHidden is false", () => {
    const nodes = [
      makeNode({ name: ".hidden" }),
      makeNode({ name: "visible.csv" }),
      makeNode({ name: ".env" }),
    ];
    const result = filterHiddenNodes(nodes, false);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("visible.csv");
  });

  test("keeps all nodes when showHidden is true", () => {
    const nodes = [
      makeNode({ name: ".hidden" }),
      makeNode({ name: "visible.csv" }),
      makeNode({ name: ".env" }),
    ];
    const result = filterHiddenNodes(nodes, true);
    expect(result).toHaveLength(3);
  });

  test("returns empty array when all nodes are hidden and showHidden is false", () => {
    const nodes = [
      makeNode({ name: ".gitignore" }),
      makeNode({ name: ".DS_Store" }),
    ];
    const result = filterHiddenNodes(nodes, false);
    expect(result).toHaveLength(0);
  });

  test("returns all nodes when none are hidden and showHidden is false", () => {
    const nodes = [
      makeNode({ name: "readme.md" }),
      makeNode({ name: "data.parquet" }),
    ];
    const result = filterHiddenNodes(nodes, false);
    expect(result).toHaveLength(2);
  });

  test("handles empty node array", () => {
    expect(filterHiddenNodes([], false)).toHaveLength(0);
    expect(filterHiddenNodes([], true)).toHaveLength(0);
  });

  test("filters hidden directories the same as hidden files", () => {
    const nodes = [
      makeNode({ name: ".hidden-dir", type: "directory" }),
      makeNode({ name: "visible-dir", type: "directory" }),
      makeNode({ name: ".secret-file", type: "file" }),
    ];
    const result = filterHiddenNodes(nodes, false);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("visible-dir");
  });

  test("recursively filters hidden children inside visible directories", () => {
    const nodes = [
      makeNode({
        name: "results",
        type: "directory",
        children: [
          makeNode({ name: ".DS_Store" }),
          makeNode({ name: "output.csv" }),
          makeNode({
            name: "nested",
            type: "directory",
            children: [
              makeNode({ name: ".hidden-deep" }),
              makeNode({ name: "data.parquet" }),
            ],
          }),
        ],
      }),
    ];
    const result = filterHiddenNodes(nodes, false);
    expect(result).toHaveLength(1);
    expect(result[0].children).toHaveLength(2);
    expect(result[0].children[0].name).toBe("output.csv");
    expect(result[0].children[1].name).toBe("nested");
    expect(result[0].children[1].children).toHaveLength(1);
    expect(result[0].children[1].children[0].name).toBe("data.parquet");
  });

  test("preserves children when showHidden is true", () => {
    const nodes = [
      makeNode({
        name: "dir",
        type: "directory",
        children: [
          makeNode({ name: ".hidden" }),
          makeNode({ name: "visible.csv" }),
        ],
      }),
    ];
    const result = filterHiddenNodes(nodes, true);
    expect(result[0].children).toHaveLength(2);
  });

  test("does not mutate original nodes when filtering children", () => {
    const hidden = makeNode({ name: ".secret" });
    const visible = makeNode({ name: "ok.csv" });
    const dir = makeNode({
      name: "dir",
      type: "directory",
      children: [hidden, visible],
    });
    const nodes = [dir];
    const result = filterHiddenNodes(nodes, false);
    // Original still has both children
    expect(dir.children).toHaveLength(2);
    // Result has only the visible one
    expect(result[0].children).toHaveLength(1);
  });
});

describe("filterNodes", () => {
  test("returns all nodes when no filters are active", () => {
    const nodes = [makeNode({ name: "a.csv" }), makeNode({ name: "b.parquet" })];
    expect(filterNodes(nodes, [], fileColumns)).toHaveLength(2);
  });

  test("filters by text (case-insensitive substring)", () => {
    const nodes = [
      makeNode({ name: "data.csv" }),
      makeNode({ name: "image.tiff" }),
      makeNode({ name: "DATA_v2.csv" }),
    ];
    const filters: ColumnFiltersState = [{ id: "name", value: "data" }];
    const result = filterNodes(nodes, filters, fileColumns);
    expect(result).toHaveLength(2);
    expect(result.map((n) => n.name)).toEqual(["data.csv", "DATA_v2.csv"]);
  });

  test("filters by select (exact match on file type)", () => {
    const nodes = [
      makeNode({ name: "a.csv", type: "file" }),
      makeNode({ name: "b.parquet", type: "file" }),
      makeNode({ name: "folder", type: "directory" }),
    ];
    const filters: ColumnFiltersState = [{ id: "file_type", value: "CSV" }];
    const result = filterNodes(nodes, filters, fileColumns);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("a.csv");
  });

  test("combines multiple filters (AND logic)", () => {
    const nodes = [
      makeNode({ name: "data.csv" }),
      makeNode({ name: "data.parquet" }),
      makeNode({ name: "image.csv" }),
    ];
    const filters: ColumnFiltersState = [
      { id: "name", value: "data" },
      { id: "file_type", value: "CSV" },
    ];
    const result = filterNodes(nodes, filters, fileColumns);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("data.csv");
  });

  test("skips unknown column IDs gracefully", () => {
    const nodes = [makeNode({ name: "test.csv" })];
    const filters: ColumnFiltersState = [{ id: "nonexistent", value: "foo" }];
    expect(filterNodes(nodes, filters, fileColumns)).toHaveLength(1);
  });

  test("treats empty filter value as no filter", () => {
    const nodes = [makeNode({ name: "test.csv" })];
    const filters: ColumnFiltersState = [{ id: "name", value: "" }];
    expect(filterNodes(nodes, filters, fileColumns)).toHaveLength(1);
  });

  test("filters bucket nodes by provider (select)", () => {
    const nodes = [
      makeNode({ name: "bucket1", type: "bucket", connectionName: "conn-aws" }),
      makeNode({ name: "bucket2", type: "bucket", connectionName: "conn-minio" }),
    ];
    const mockConfigs = {
      "conn-aws": { provider: "aws" },
      "conn-minio": { provider: "minio" },
    } as unknown as Record<string, import("~/.generated/client").ConnectionConfig>;
    const filters: ColumnFiltersState = [{ id: "provider", value: "aws" }];
    const result = filterNodes(nodes, filters, bucketColumns, "connections", mockConfigs);
    expect(result).toHaveLength(1);
    expect(result[0].connectionName).toBe("conn-aws");
  });

  test("filters bucket nodes by name (text)", () => {
    const nodes = [
      makeNode({ name: "production-data", type: "bucket" }),
      makeNode({ name: "staging-logs", type: "bucket" }),
    ];
    const filters: ColumnFiltersState = [{ id: "name", value: "prod" }];
    const result = filterNodes(nodes, filters, bucketColumns, "connections");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("production-data");
  });
});
