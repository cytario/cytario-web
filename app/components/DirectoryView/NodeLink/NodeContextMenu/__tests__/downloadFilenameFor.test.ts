import { describe, expect, test } from "vitest";

import { downloadFilenameFor } from "../DownloadMenuItem";

describe("downloadFilenameFor", () => {
  test("listing files pass through unchanged (name already has the path's extension)", () => {
    expect(downloadFilenameFor("slide.ome.tif", "data/slide.ome.tif")).toBe("slide.ome.tif");
    expect(downloadFilenameFor("export.json", "dir/export.json")).toBe("export.json");
  });

  test("extension-less display names get the path's extension appended", () => {
    expect(downloadFilenameFor("Annotation Set 1", "data/slide.annotations.abc.json")).toBe(
      "Annotation Set 1.json",
    );
    expect(downloadFilenameFor("patient-12-tumor", "x/patient-12-tumor.geojson")).toBe(
      "patient-12-tumor.geojson",
    );
  });

  test("a name that already ends in the path's extension is left alone", () => {
    expect(downloadFilenameFor("tumor.json", "data/slide.annotations.abc.json")).toBe("tumor.json");
  });

  test("a dotted name without the path's extension still gets it appended", () => {
    expect(downloadFilenameFor("slide.2", "data/slide.annotations.abc.json")).toBe("slide.2.json");
  });

  test("extension-less path passes the name through unchanged", () => {
    expect(downloadFilenameFor("README", "dir/README")).toBe("README");
  });
});
