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
        type: "directory",
        name: "folder1",
        bucketName: "test-bucket",
        pathName: "folder1/",
        children: [
          {
            type: "file",
            name: "file1.txt",
            pathName: "folder1/file1.txt",
            bucketName: "test-bucket",
            children: [],
            _Object: {
              Key: "folder1/file1.txt",
              presignedUrl: "http://example.com/file1.txt",
            },
          },
          {
            type: "file",
            name: "file2.txt",
            bucketName: "test-bucket",
            pathName: "folder1/file2.txt",
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
        type: "directory",
        name: "folder2",
        bucketName: "test-bucket",
        pathName: "folder2/",
        children: [
          {
            type: "file",
            name: "file3.txt",
            bucketName: "test-bucket",
            pathName: "folder2/file3.txt",
            children: [],
            _Object: {
              Key: "folder2/file3.txt",
              presignedUrl: "http://example.com/file1.txt",
            },
          },
          {
            type: "directory",
            name: "subfolder1",
            pathName: "folder2/subfolder1/",
            bucketName: "test-bucket",
            children: [
              {
                type: "file",
                name: "file4.txt",
                bucketName: "test-bucket",
                pathName: "folder2/subfolder1/file4.txt",
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
      const tree = buildDirectoryTree("test-bucket", objects);
      expect(tree).toEqual(expectedTree);
    }
  );
});
