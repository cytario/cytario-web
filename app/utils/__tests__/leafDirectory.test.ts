import {
  companionDirectoryPrefixes,
  hasCompanionDirectory,
  isInsideHiddenPrefix,
  isInsideLeafDirectory,
  isLeafDirectory,
  isLeafDirectoryPath,
} from "../leafDirectory";
import {
  __resetBuiltinFormats,
  registerBuiltinFormats,
} from "~/components/.client/ImageViewer/state/formats/builtins";
import { formatRegistry } from "~/components/ImageViewer/state/formatRegistry";

vi.mock("~/components/.client/ImageViewer/state/loaders/loadOmeTiffWithCredentials", () => ({
  loadOmeTiffWithCredentials: vi.fn(async () => ({ data: [], metadata: {} as never })),
}));
vi.mock("~/components/.client/ImageViewer/state/loaders/loadBioformatsZarrWithCredentials", () => ({
  loadBioformatsZarrWithCredentials: vi.fn(async () => ({ data: [], metadata: {} as never })),
}));

describe("isLeafDirectory", () => {
  test("detects .zarr", () => {
    expect(isLeafDirectory("data.zarr")).toBe(true);
  });

  test("detects .ome.zarr", () => {
    expect(isLeafDirectory("sample.ome.zarr")).toBe(true);
  });

  test("case-insensitive with trailing slash", () => {
    expect(isLeafDirectory("Sample.ZARR/")).toBe(true);
  });

  test("accepts full paths and URLs (suffix match)", () => {
    expect(isLeafDirectory("images/sample.zarr")).toBe(true);
    expect(isLeafDirectory("https://bucket.s3.amazonaws.com/data.zarr")).toBe(true);
  });

  test("rejects plain files and directories", () => {
    expect(isLeafDirectory("image.ome.tif")).toBe(false);
    expect(isLeafDirectory("images/sample-001/")).toBe(false);
    expect(isLeafDirectory("zarring")).toBe(false);
    expect(isLeafDirectory(".zarr-config")).toBe(false);
    expect(isLeafDirectory("")).toBe(false);
  });

  test("rejects interior keys — only the leaf root matches", () => {
    expect(isLeafDirectory("sample.zarr/0/0/0")).toBe(false);
  });

  test("strips query strings like other file-type matching", () => {
    expect(isLeafDirectory("data.zarr?version=1")).toBe(true);
  });

  test("plugins extend coverage via fileTypeMeta.storageLayout", () => {
    try {
      formatRegistry.add("test-plugin", ["vsi"], {
        load: (async () => {
          throw new Error("unused");
        }) as never,
        fileTypeMeta: { label: "VSI", storageLayout: "leaf" },
      });
      expect(isLeafDirectory("scan.vsi")).toBe(true);
    } finally {
      formatRegistry.__reset();
      registerBuiltinFormats();
    }
  });

  test("plugin entry without storageLayout inherits from shadowed static entry", () => {
    try {
      // Simulates the deployed mrxs loader plugin: registers the format
      // (shadowing the static MRXS entry) but omits the layout flag.
      formatRegistry.add("test-plugin", ["mrxs"], {
        load: (async () => {
          throw new Error("unused");
        }) as never,
        fileTypeMeta: { label: "MRXS" },
      });
      expect(hasCompanionDirectory("slide.mrxs")).toBe(true);
    } finally {
      formatRegistry.__reset();
      registerBuiltinFormats();
    }
  });

  test("explicit plugin storageLayout wins over the static fallback", () => {
    try {
      formatRegistry.add("test-plugin", ["mrxs"], {
        load: (async () => {
          throw new Error("unused");
        }) as never,
        fileTypeMeta: { label: "MRXS", storageLayout: "leaf" },
      });
      expect(hasCompanionDirectory("slide.mrxs")).toBe(false);
      expect(isLeafDirectory("slide.mrxs")).toBe(true);
    } finally {
      formatRegistry.__reset();
      registerBuiltinFormats();
    }
  });
});

describe("isLeafDirectoryPath", () => {
  test("true for leaf roots and interior keys", () => {
    expect(isLeafDirectoryPath("sample.zarr")).toBe(true);
    expect(isLeafDirectoryPath("experiments/2024/sample-001.zarr/0/0")).toBe(true);
  });

  test("false for unrelated paths", () => {
    expect(isLeafDirectoryPath("images/sample-001/")).toBe(false);
    expect(isLeafDirectoryPath("zarring/data")).toBe(false);
    expect(isLeafDirectoryPath(".zarr-config/settings")).toBe(false);
    expect(isLeafDirectoryPath("")).toBe(false);
  });
});

describe("isInsideLeafDirectory", () => {
  test("true for interior keys", () => {
    expect(isInsideLeafDirectory("sample.zarr/0/0")).toBe(true);
    expect(isInsideLeafDirectory("dir/sample.zarr/sub/file")).toBe(true);
  });

  test("false for the leaf root object and plain keys", () => {
    expect(isInsideLeafDirectory("sample.zarr")).toBe(false);
    expect(isInsideLeafDirectory("dir/file.zarr")).toBe(false);
    expect(isInsideLeafDirectory("")).toBe(false);
  });
});

describe("companion directories (.mrxs)", () => {
  test("hasCompanionDirectory detects .mrxs and .vsi files", () => {
    expect(hasCompanionDirectory("slide.mrxs")).toBe(true);
    expect(hasCompanionDirectory("slides/slide.MRXS")).toBe(true);
    expect(hasCompanionDirectory("OS-1.vsi")).toBe(true);
    expect(hasCompanionDirectory("slide.zarr")).toBe(false);
    expect(hasCompanionDirectory("slide.tif")).toBe(false);
  });

  test("companionDirectoryPrefixes maps sibling files to hidden dir prefixes", () => {
    expect(companionDirectoryPrefixes(["slide.mrxs"])).toEqual(new Set(["slide/"]));
    expect(companionDirectoryPrefixes(["a/b/slide.mrxs"])).toEqual(new Set(["a/b/slide/"]));
    expect(companionDirectoryPrefixes(["slide.tif", "slide/"])).toEqual(new Set());
  });

  test("vsi companion dirs use the _{stem}_ template", () => {
    expect(companionDirectoryPrefixes(["OS-1.vsi"])).toEqual(new Set(["_OS-1_/"]));
    expect(companionDirectoryPrefixes(["vsi/OS-1.vsi"])).toEqual(new Set(["vsi/_OS-1_/"]));
    expect(companionDirectoryPrefixes(["OS-2.vsi", "OS-2/"])).toEqual(new Set(["_OS-2_/"]));
  });
});

describe("isInsideHiddenPrefix", () => {
  test("true for keys inside a companion dir prefix", () => {
    const hidden = new Set(["scope/slide/"]);
    expect(isInsideHiddenPrefix("scope/slide/thumbnail.jpg", hidden)).toBe(true);
    expect(isInsideHiddenPrefix("scope/slide/sub/data.dat", hidden)).toBe(true);
  });

  test("false for the companion dir prefix itself and unrelated keys", () => {
    const hidden = new Set(["scope/slide/"]);
    expect(isInsideHiddenPrefix("scope/slide/", hidden)).toBe(true);
    expect(isInsideHiddenPrefix("scope/other/file.tif", hidden)).toBe(false);
    expect(isInsideHiddenPrefix("scope/slide", hidden)).toBe(false);
  });

  test("empty set matches nothing", () => {
    expect(isInsideHiddenPrefix("scope/anything", new Set())).toBe(false);
  });

  test("handles multiple prefixes", () => {
    const hidden = new Set(["a/b/", "x/y/"]);
    expect(isInsideHiddenPrefix("a/b/c", hidden)).toBe(true);
    expect(isInsideHiddenPrefix("x/y/z", hidden)).toBe(true);
    expect(isInsideHiddenPrefix("a/c", hidden)).toBe(false);
  });
});

describe("builtin zarr registration still resolves after reset", () => {
  test("builtins re-register leaf detection", () => {
    formatRegistry.__reset();
    __resetBuiltinFormats();
    registerBuiltinFormats();
    expect(isLeafDirectory("data.zarr")).toBe(true);
  });
});
