import type { ColumnFiltersState } from "@tanstack/react-table";
import { describe, expect, test } from "vitest";

import type { TreeNode } from "../buildDirectoryTree";
import { filterNodes } from "../filterNodes";
import type { ColumnConfig } from "~/components/Table/types";

const makeNode = (overrides: Partial<TreeNode> = {}): TreeNode => ({
  alias: "aws-bucket",
  name: "file.csv",
  type: "file",
  bucketName: "bucket",
  provider: "aws",
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
      makeNode({ name: "bucket1", type: "bucket", provider: "aws" }),
      makeNode({ name: "bucket2", type: "bucket", provider: "minio" }),
    ];
    const filters: ColumnFiltersState = [{ id: "provider", value: "aws" }];
    const result = filterNodes(nodes, filters, bucketColumns, true);
    expect(result).toHaveLength(1);
    expect(result[0].provider).toBe("aws");
  });

  test("filters bucket nodes by name (text)", () => {
    const nodes = [
      makeNode({ name: "production-data", type: "bucket" }),
      makeNode({ name: "staging-logs", type: "bucket" }),
    ];
    const filters: ColumnFiltersState = [{ id: "name", value: "prod" }];
    const result = filterNodes(nodes, filters, bucketColumns, true);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("production-data");
  });
});
