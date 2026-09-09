import { _Object } from "@aws-sdk/client-s3";
import { describe, expect, test } from "vitest";

import { filterObjects } from "../filterObjects";
import type { TreeFilters } from "~/components/DirectoryView/treeFilters";

const testCases: [string, _Object[], { query?: string; filters?: TreeFilters }, _Object[]][] = [
  [
    "filter objects by query",
    [{ Key: "folder1/file1.tif" }, { Key: "folder2/file2.tif" }],
    { query: "file1" },
    [{ Key: "folder1/file1.tif" }],
  ],
  [
    "sort objects alphabetically by key",
    [{ Key: "file2.tif" }, { Key: "file1.tif" }, { Key: "folder1/file3.tif" }],
    {},
    [{ Key: "file1.tif" }, { Key: "file2.tif" }, { Key: "folder1/file3.tif" }],
  ],
  [
    "return empty array if no objects match the query",
    [{ Key: "folder1/file1.tif" }, { Key: "folder2/file2.tif" }],
    { query: "notfound" },
    [],
  ],
  [
    "handle objects without a query or prefix",
    [{ Key: "folder1/file1.tif" }, { Key: "folder2/file2.tif" }],
    {},
    [{ Key: "folder1/file1.tif" }, { Key: "folder2/file2.tif" }],
  ],
  ["drop objects with empty key", [{ Key: "" }], {}, []],
  [
    "filter objects by extension",
    [{ Key: "a/data.parquet" }, { Key: "a/data.csv" }, { Key: "a/parquet/readme.txt" }],
    { filters: { extensions: ["parquet"] } },
    [{ Key: "a/data.parquet" }],
  ],
  [
    "match any of several extensions",
    [{ Key: "a/data.parquet" }, { Key: "a/data.csv" }, { Key: "a/readme.txt" }],
    { filters: { extensions: ["parquet", "csv"] } },
    [{ Key: "a/data.csv" }, { Key: "a/data.parquet" }],
  ],
  [
    "match extension case-insensitively",
    [{ Key: "a/data.PARQUET" }],
    { filters: { extensions: ["parquet"] } },
    [{ Key: "a/data.PARQUET" }],
  ],
  [
    "hide dot-files and sidecars when filters are given and toggle is off",
    [
      { Key: "a/slide.ome.tif" },
      { Key: "a/.DS_Store" },
      { Key: "a/settings.u1.json" },
      { Key: "a/slide.ome.annotations.set-1.json" },
    ],
    { filters: {} },
    [{ Key: "a/slide.ome.tif" }],
  ],
  [
    "keep hidden files when no filters object is passed",
    [{ Key: "a/slide.ome.tif" }, { Key: "a/.DS_Store" }],
    {},
    [{ Key: "a/.DS_Store" }, { Key: "a/slide.ome.tif" }],
  ],
  [
    "show hidden files when toggled on",
    [{ Key: "a/slide.ome.tif" }, { Key: "a/.DS_Store" }],
    { filters: { showHiddenFiles: true } },
    [{ Key: "a/.DS_Store" }, { Key: "a/slide.ome.tif" }],
  ],
  [
    "combine query, extension, and hidden",
    [{ Key: "a/foo.parquet" }, { Key: "a/bar.parquet" }, { Key: "a/.foo.parquet" }],
    { query: "foo", filters: { extensions: ["parquet"] } },
    [{ Key: "a/foo.parquet" }],
  ],
];

describe("filterObjects", () => {
  test.each(testCases)("%s", (_, objects, args, expected) => {
    const result = filterObjects(objects, args);
    expect(result).toEqual(expected);
  });
});
