import type { _Object } from "@aws-sdk/client-s3";

import { buildDirectoryTree, buildLevelTree, TreeNode } from "../buildDirectoryTree";

const testCases: [_Object[], TreeNode[]][] = [
  [
    [
      { Key: "folder1/file1.txt" },
      { Key: "folder1/file2.txt" },
      { Key: "folder2/file3.txt" },
      { Key: "folder2/subfolder1/file4.txt" },
    ],
    [
      {
        id: "test-conn-id/folder1/",
        connectionId: "test-conn-id",
        connectionName: "test-connection",
        type: "directory",
        name: "folder1",

        pathName: "folder1/",

        children: [
          {
            id: "test-conn-id/folder1/file1.txt",
            connectionId: "test-conn-id",
            connectionName: "test-connection",
            type: "file",
            name: "file1.txt",
            pathName: "folder1/file1.txt",

            children: [],
            _Object: { Key: "folder1/file1.txt" },
          },
          {
            id: "test-conn-id/folder1/file2.txt",
            connectionId: "test-conn-id",
            connectionName: "test-connection",
            type: "file",
            name: "file2.txt",

            pathName: "folder1/file2.txt",

            children: [],
            _Object: { Key: "folder1/file2.txt" },
          },
        ],
        _Object: { Key: "folder1/file1.txt" },
      },
      {
        id: "test-conn-id/folder2/",
        connectionId: "test-conn-id",
        connectionName: "test-connection",
        type: "directory",
        name: "folder2",

        pathName: "folder2/",

        children: [
          {
            id: "test-conn-id/folder2/file3.txt",
            connectionId: "test-conn-id",
            connectionName: "test-connection",
            type: "file",
            name: "file3.txt",

            pathName: "folder2/file3.txt",

            children: [],
            _Object: { Key: "folder2/file3.txt" },
          },
          {
            id: "test-conn-id/folder2/subfolder1/",
            connectionId: "test-conn-id",
            connectionName: "test-connection",
            type: "directory",
            name: "subfolder1",
            pathName: "folder2/subfolder1/",

            children: [
              {
                id: "test-conn-id/folder2/subfolder1/file4.txt",
                connectionId: "test-conn-id",
                connectionName: "test-connection",
                type: "file",
                name: "file4.txt",

                pathName: "folder2/subfolder1/file4.txt",

                children: [],
                _Object: { Key: "folder2/subfolder1/file4.txt" },
              },
            ],
            _Object: { Key: "folder2/subfolder1/file4.txt" },
          },
        ],
        _Object: { Key: "folder2/file3.txt" },
      },
    ],
  ],
];

describe("buildDirectoryTree", () => {
  test.each(testCases)(
    "should correctly build a directory tree from a flat list of objects",
    (objects, expectedTree) => {
      const tree = buildDirectoryTree(objects, "test-conn-id", "test-connection");
      expect(tree).toEqual(expectedTree);
    },
  );

  test("should prepend urlPath to node pathNames when navigating into a subdirectory", () => {
    const objects: _Object[] = [{ Key: "subdir/file.tif" }];

    const tree = buildDirectoryTree(objects, "my-conn-id", "my-connection", "subdir/", "subdir");

    expect(tree).toEqual([
      {
        id: "my-conn-id/subdir/file.tif",
        connectionId: "my-conn-id",
        connectionName: "my-connection",
        type: "file",
        name: "file.tif",
        pathName: "subdir/file.tif",
        children: [],
        _Object: { Key: "subdir/file.tif" },
      },
    ]);
  });

  test("should skip S3 folder marker objects (keys ending with /)", () => {
    const objects: _Object[] = [{ Key: "czi/" }, { Key: "czi/ULT-2022-16901-457_V1.czi" }];

    const tree = buildDirectoryTree(objects, "my-conn-id", "my-connection");

    expect(tree).toHaveLength(1);
    expect(tree[0].type).toBe("directory");
    expect(tree[0].name).toBe("czi");
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children![0].name).toBe("ULT-2022-16901-457_V1.czi");
    expect(tree[0].children![0].type).toBe("file");
  });

  test("should handle nested folder markers without creating phantom nodes", () => {
    const objects: _Object[] = [{ Key: "a/" }, { Key: "a/b/" }, { Key: "a/b/file.txt" }];

    const tree = buildDirectoryTree(objects, "my-conn-id", "my-connection");

    expect(tree).toHaveLength(1);
    expect(tree[0].name).toBe("a");
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children![0].name).toBe("b");
    expect(tree[0].children![0].children).toHaveLength(1);
    expect(tree[0].children![0].children![0].name).toBe("file.txt");
  });

  test("should produce paths relative to connection root without urlPath", () => {
    const objects: _Object[] = [{ Key: "subdir/file.tif" }];

    const tree = buildDirectoryTree(objects, "my-conn-id", "my-connection");

    expect(tree[0].pathName).toBe("subdir/");
    expect(tree[0].children![0].pathName).toBe("subdir/file.tif");
  });
});

describe("buildLevelTree", () => {
  test("emits directories from CommonPrefixes and files from Contents", () => {
    const nodes = buildLevelTree({
      contents: [{ Key: "file1.tif" }, { Key: "file2.tif" }],
      commonPrefixes: ["subdir/", "czi/"],
      connectionId: "test-conn-id",
      connectionName: "test-connection",
    });

    expect(nodes).toEqual([
      {
        id: "test-conn-id/subdir/",
        connectionId: "test-conn-id",
        connectionName: "test-connection",
        type: "directory",
        name: "subdir",
        pathName: "subdir/",
        children: [],
        hasChildren: true,
        isLeaf: false,
        loadState: "idle",
      },
      {
        id: "test-conn-id/czi/",
        connectionId: "test-conn-id",
        connectionName: "test-connection",
        type: "directory",
        name: "czi",
        pathName: "czi/",
        children: [],
        hasChildren: true,
        isLeaf: false,
        loadState: "idle",
      },
      {
        id: "test-conn-id/file1.tif",
        connectionId: "test-conn-id",
        connectionName: "test-connection",
        type: "file",
        name: "file1.tif",
        pathName: "file1.tif",
        isLeaf: true,
        _Object: { Key: "file1.tif" },
      },
      {
        id: "test-conn-id/file2.tif",
        connectionId: "test-conn-id",
        connectionName: "test-connection",
        type: "file",
        name: "file2.tif",
        pathName: "file2.tif",
        isLeaf: true,
        _Object: { Key: "file2.tif" },
      },
    ]);
  });

  test("file leaves omit children so react-arborist hides the chevron", () => {
    const nodes = buildLevelTree({
      contents: [{ Key: "file.tif" }],
      commonPrefixes: [],
      connectionId: "test-conn-id",
      connectionName: "test-connection",
    });

    expect(nodes[0].children).toBeUndefined();
    expect(nodes[0].isLeaf).toBe(true);
  });

  test("collapses .zarr/ CommonPrefix into a file-typed leaf with no expand hint", () => {
    const nodes = buildLevelTree({
      contents: [],
      commonPrefixes: ["data.zarr/"],
      connectionId: "test-conn-id",
      connectionName: "test-connection",
    });

    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({
      type: "file",
      name: "data.zarr",
      isLeaf: true,
      hasChildren: false,
      loadState: undefined,
    });
    expect(nodes[0].children).toBeUndefined();
  });

  test("strips the listing prefix from CommonPrefix and Contents keys", () => {
    const nodes = buildLevelTree({
      contents: [{ Key: "outer/inner/leaf.tif" }],
      commonPrefixes: ["outer/inner/sub/"],
      connectionId: "test-conn-id",
      connectionName: "test-connection",
      prefix: "outer/inner/",
      urlPath: "outer/inner",
    });

    expect(nodes).toEqual([
      {
        id: "test-conn-id/outer/inner/sub/",
        connectionId: "test-conn-id",
        connectionName: "test-connection",
        type: "directory",
        name: "sub",
        pathName: "outer/inner/sub/",
        children: [],
        hasChildren: true,
        isLeaf: false,
        loadState: "idle",
      },
      {
        id: "test-conn-id/outer/inner/leaf.tif",
        connectionId: "test-conn-id",
        connectionName: "test-connection",
        type: "file",
        name: "leaf.tif",
        pathName: "outer/inner/leaf.tif",
        isLeaf: true,
        _Object: { Key: "outer/inner/leaf.tif" },
      },
    ]);
  });

  test("skips folder marker keys ending with '/'", () => {
    const nodes = buildLevelTree({
      contents: [{ Key: "marker/" }, { Key: "actual.tif" }],
      commonPrefixes: [],
      connectionId: "test-conn-id",
      connectionName: "test-connection",
    });

    expect(nodes).toHaveLength(1);
    expect(nodes[0].name).toBe("actual.tif");
  });
});
