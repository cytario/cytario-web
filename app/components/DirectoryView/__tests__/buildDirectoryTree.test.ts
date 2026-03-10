import { buildDirectoryTree, TreeNode } from "../buildDirectoryTree";
import { ObjectPresignedUrl } from "~/routes/objects.route";

const testCases: [ObjectPresignedUrl[], TreeNode[]][] = [
  [
    [
      {
        Key: "folder1/file1.txt",
        presignedUrl: "http://example.com/file1.txt",
      },
      {
        Key: "folder1/file2.txt",
        presignedUrl: "http://example.com/file1.txt",
      },
      {
        Key: "folder2/file3.txt",
        presignedUrl: "http://example.com/file1.txt",
      },
      {
        Key: "folder2/subfolder1/file4.txt",
        presignedUrl: "http://example.com/file1.txt",
      },
    ],
    [
      {
        alias: "test-alias",
        type: "directory",
        name: "folder1",
        bucketName: "test-bucket",
        pathName: "folder1/",
        provider: "test-provider",
        children: [
          {
            alias: "test-alias",
            type: "file",
            name: "file1.txt",
            pathName: "folder1/file1.txt",
            bucketName: "test-bucket",
            provider: "test-provider",
            children: [],
            _Object: {
              Key: "folder1/file1.txt",
              presignedUrl: "http://example.com/file1.txt",
            },
          },
          {
            alias: "test-alias",
            type: "file",
            name: "file2.txt",
            bucketName: "test-bucket",
            pathName: "folder1/file2.txt",
            provider: "test-provider",
            children: [],
            _Object: {
              Key: "folder1/file2.txt",
              presignedUrl: "http://example.com/file1.txt",
            },
          },
        ],
        _Object: {
          Key: "folder1/file1.txt",
          presignedUrl: "http://example.com/file1.txt",
        },
      },
      {
        alias: "test-alias",
        type: "directory",
        name: "folder2",
        bucketName: "test-bucket",
        pathName: "folder2/",
        provider: "test-provider",
        children: [
          {
            alias: "test-alias",
            type: "file",
            name: "file3.txt",
            bucketName: "test-bucket",
            pathName: "folder2/file3.txt",
            provider: "test-provider",
            children: [],
            _Object: {
              Key: "folder2/file3.txt",
              presignedUrl: "http://example.com/file1.txt",
            },
          },
          {
            alias: "test-alias",
            type: "directory",
            name: "subfolder1",
            pathName: "folder2/subfolder1/",
            bucketName: "test-bucket",
            provider: "test-provider",
            children: [
              {
                alias: "test-alias",
                type: "file",
                name: "file4.txt",
                bucketName: "test-bucket",
                pathName: "folder2/subfolder1/file4.txt",
                provider: "test-provider",
                children: [],
                _Object: {
                  Key: "folder2/subfolder1/file4.txt",
                  presignedUrl: "http://example.com/file1.txt",
                },
              },
            ],
            _Object: {
              Key: "folder2/subfolder1/file4.txt",
              presignedUrl: "http://example.com/file1.txt",
            },
          },
        ],
        _Object: {
          Key: "folder2/file3.txt",
          presignedUrl: "http://example.com/file1.txt",
        },
      },
    ],
  ],
  // // no directories
  // [
  //   [
  //     {
  //       Key: "file1.txt",
  //       presignedUrl: "http://example.com/file1.txt",
  //     } as ObjectPresignedUrl,
  //     {
  //       Key: "file2.txt",
  //       presignedUrl: "http://example.com/file1.txt",
  //     } as ObjectPresignedUrl,
  //   ],
  //   [
  //     {
  //       type: "file",
  //       name: "file1.txt",
  //       bucketName: "test-bucket",
  //       children: [],
  //       _Object: {
  //         Key: "file1.txt",
  //         presignedUrl: "http://example.com/file1.txt",
  //       },
  //     },
  //     {
  //       type: "file",
  //       name: "file2.txt",
  //       bucketName: "test-bucket",
  //       children: [],
  //       _Object: {
  //         Key: "file2.txt",
  //         presignedUrl: "http://example.com/file1.txt",
  //       },
  //     },
  //   ],
  // ],
  // // no data
  // [[], []],
];

describe("buildDirectoryTree", () => {
  test.each(testCases)(
    "should correctly build a directory tree from a flat list of objects",
    (objects, expectedTree) => {
      const tree = buildDirectoryTree("test-bucket", objects, "test-provider", "test-alias");
      expect(tree).toEqual(expectedTree);
    }
  );

  test("should prepend urlPath to node pathNames when navigating into a subdirectory", () => {
    const objects: ObjectPresignedUrl[] = [
      { Key: "subdir/file.tif", presignedUrl: "https://example.com/file.tif" },
    ];

    // Simulate navigating into "subdir/" within a connection:
    // S3 prefix "subdir/" is stripped, but urlPath "subdir" anchors paths to connection root
    const tree = buildDirectoryTree(
      "my-bucket", objects, "aws", "my-alias", "subdir/", "subdir",
    );

    expect(tree).toEqual([
      {
        alias: "my-alias",
        type: "file",
        name: "file.tif",
        pathName: "subdir/file.tif",
        bucketName: "my-bucket",
        provider: "aws",
        children: [],
        _Object: { Key: "subdir/file.tif", presignedUrl: "https://example.com/file.tif" },
      },
    ]);
  });

  test("should produce paths relative to connection root without urlPath", () => {
    const objects: ObjectPresignedUrl[] = [
      { Key: "subdir/file.tif", presignedUrl: "https://example.com/file.tif" },
    ];

    // At connection root (no urlPath), paths are relative to root
    const tree = buildDirectoryTree(
      "my-bucket", objects, "aws", "my-alias",
    );

    expect(tree[0].pathName).toBe("subdir/");
    expect(tree[0].children[0].pathName).toBe("subdir/file.tif");
  });
});
