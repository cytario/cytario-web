import type { _Object } from "@aws-sdk/client-s3";

import { createConnectionIndexFilter } from "~/routes/connectionIndex/connectionIndexFilter";

function obj(key: string): _Object {
  return { Key: key, Size: 0 };
}

describe("createConnectionIndexFilter", () => {
  test("accepts regular files", () => {
    const filter = createConnectionIndexFilter();
    expect(filter(obj("foo/bar.txt"))).toBe(true);
    expect(filter(obj("baz.png"))).toBe(true);
  });

  test("keeps .cytario/ entries — visibility is a UI concern, not an indexing one", () => {
    const filter = createConnectionIndexFilter();
    expect(filter(obj(".cytario/index.parquet"))).toBe(true);
    expect(filter(obj("prefix/.cytario/index.parquet"))).toBe(true);
    expect(filter(obj("deep/nested/.cytario/whatever"))).toBe(true);
  });

  test("keeps only the first object encountered under each *.zarr/ root", () => {
    const filter = createConnectionIndexFilter();
    expect(filter(obj("img.zarr/.zattrs"))).toBe(true);
    expect(filter(obj("img.zarr/0/0"))).toBe(false);
    expect(filter(obj("img.zarr/1/0"))).toBe(false);
    // A different zarr root is still accepted once.
    expect(filter(obj("other.zarr/.zattrs"))).toBe(true);
    expect(filter(obj("other.zarr/0/0"))).toBe(false);
  });

  test("zarr match is case-insensitive on the segment suffix", () => {
    const filter = createConnectionIndexFilter();
    expect(filter(obj("UPPER.ZARR/.zattrs"))).toBe(true);
    expect(filter(obj("UPPER.ZARR/0/0"))).toBe(false);
    expect(filter(obj("Mixed.Zarr/.zattrs"))).toBe(true);
    expect(filter(obj("Mixed.Zarr/0/0"))).toBe(false);
  });

  test("does not collapse files whose names merely contain .zarr without a trailing /", () => {
    const filter = createConnectionIndexFilter();
    expect(filter(obj("notes-about-zarr.md"))).toBe(true);
    expect(filter(obj("archive.zarr.tar"))).toBe(true);
  });

  test("each instance has its own seen-roots state", () => {
    const a = createConnectionIndexFilter();
    const b = createConnectionIndexFilter();
    expect(a(obj("img.zarr/.zattrs"))).toBe(true);
    // Same root via a different instance still accepted once.
    expect(b(obj("img.zarr/0/0"))).toBe(true);
  });

  test("ignores undefined Key (defensive)", () => {
    const filter = createConnectionIndexFilter();
    expect(filter({ Size: 0 } as _Object)).toBe(true);
  });
});
