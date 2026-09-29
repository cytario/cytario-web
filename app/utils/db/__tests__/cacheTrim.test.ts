import { describe, expect, test, vi } from "vitest";

import { trimCaches } from "../cacheTrim";
import { trimDecoderCache } from "~/components/.client/ImageViewer/state/decoders/genericDecoder";
import { trimSharedTileCaches } from "~/components/.client/ImageViewer/utils/sharedTileCache";

vi.mock("~/components/.client/ImageViewer/state/decoders/genericDecoder", () => ({
  trimDecoderCache: vi.fn(),
}));
vi.mock("~/components/.client/ImageViewer/utils/sharedTileCache", () => ({
  trimSharedTileCaches: vi.fn(),
}));

describe("trimCaches", () => {
  test("releases both the shared tile caches and the decoded-block cache", () => {
    trimCaches();

    expect(trimSharedTileCaches).toHaveBeenCalledTimes(1);
    expect(trimDecoderCache).toHaveBeenCalledTimes(1);
  });
});
