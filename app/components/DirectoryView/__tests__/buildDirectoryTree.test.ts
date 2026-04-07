import type { _Object } from "@aws-sdk/client-s3";

import { buildDirectoryTree, TreeNode } from "../buildDirectoryTree";

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
        connectionName: "test-connection",
        type: "directory",
        name: "folder1",
        bucketName: "test-bucket",
        pathName: "folder1/",
        provider: "test-provider",
        children: [
          {
            connectionName: "test-connection",
            type: "file",
            name: "file1.txt",
            pathName: "folder1/file1.txt",
            bucketName: "test-bucket",
            provider: "test-provider",
            children: [],
            _Object: { Key: "folder1/file1.txt" },
          },
          {
            connectionName: "test-connection",
            type: "file",
            name: "file2.txt",
            bucketName: "test-bucket",
            pathName: "folder1/file2.txt",
            provider: "test-provider",
            children: [],
            _Object: { Key: "folder1/file2.txt" },
          },
        ],
        _Object: { Key: "folder1/file1.txt" },
      },
      {
        connectionName: "test-connection",
        type: "directory",
        name: "folder2",
        bucketName: "test-bucket",
        pathName: "folder2/",
        provider: "test-provider",
        children: [
          {
            connectionName: "test-connection",
            type: "file",
            name: "file3.txt",
            bucketName: "test-bucket",
            pathName: "folder2/file3.txt",
            provider: "test-provider",
            children: [],
            _Object: { Key: "folder2/file3.txt" },
          },
          {
            connectionName: "test-connection",
            type: "directory",
            name: "subfolder1",
            pathName: "folder2/subfolder1/",
            bucketName: "test-bucket",
            provider: "test-provider",
            children: [
              {
                connectionName: "test-connection",
                type: "file",
                name: "file4.txt",
                bucketName: "test-bucket",
                pathName: "folder2/subfolder1/file4.txt",
                provider: "test-provider",
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
      const tree = buildDirectoryTree("test-bucket", objects, "test-provider", "test-connection");
      expect(tree).toEqual(expectedTree);
    }
  );

  test("should prepend urlPath to node pathNames when navigating into a subdirectory", () => {
    const objects: _Object[] = [
      { Key: "subdir/file.tif" },
    ];

    const tree = buildDirectoryTree(
      "my-bucket", objects, "aws", "my-connection", "subdir/", "subdir",
    );

    expect(tree).toEqual([
      {
        connectionName: "my-connection",
        type: "file",
        name: "file.tif",
        pathName: "subdir/file.tif",
        bucketName: "my-bucket",
        provider: "aws",
        children: [],
        _Object: { Key: "subdir/file.tif" },
      },
    ]);
  });

  test("should skip S3 folder marker objects (keys ending with /)", () => {
    const objects: _Object[] = [
      { Key: "czi/" },
      { Key: "czi/ULT-2022-16901-457_V1.czi" },
    ];

    const tree = buildDirectoryTree("my-bucket", objects, "aws", "my-connection");

    expect(tree).toHaveLength(1);
    expect(tree[0].type).toBe("directory");
    expect(tree[0].name).toBe("czi");
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children[0].name).toBe("ULT-2022-16901-457_V1.czi");
    expect(tree[0].children[0].type).toBe("file");
  });

  test("should handle nested folder markers without creating phantom nodes", () => {
    const objects: _Object[] = [
      { Key: "a/" },
      { Key: "a/b/" },
      { Key: "a/b/file.txt" },
    ];

    const tree = buildDirectoryTree("my-bucket", objects, "aws", "my-connection");

    expect(tree).toHaveLength(1);
    expect(tree[0].name).toBe("a");
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children[0].name).toBe("b");
    expect(tree[0].children[0].children).toHaveLength(1);
    expect(tree[0].children[0].children[0].name).toBe("file.txt");
  });

  test("should produce paths relative to connection root without urlPath", () => {
    const objects: _Object[] = [
      { Key: "subdir/file.tif" },
    ];

    const tree = buildDirectoryTree(
      "my-bucket", objects, "aws", "my-connection",
    );

    expect(tree[0].pathName).toBe("subdir/");
    expect(tree[0].children[0].pathName).toBe("subdir/file.tif");
  });
});
