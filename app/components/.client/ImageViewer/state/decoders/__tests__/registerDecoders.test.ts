import { getDecoder } from "geotiff";
import { describe, expect, test, vi } from "vitest";

import { registerDecoders } from "../registerDecoders";

vi.mock("../lzwDecoder", () => ({
  LZWDecoder: class MockLZWDecoder {
    getDecoderId() {
      return "lzw-decoder";
    }
  },
}));

vi.mock("../jp2k-decoder", () => ({
  JP2KDecoder: class MockJP2KDecoder {
    getDecoderId() {
      return "jp2k-decoder";
    }
  },
}));

vi.mock("./genericDecoder", () => ({
  GenericDecoder: class MockGenericDecoder {},
  trimDecoderCache: () => {},
  shutdownDecoderPool: () => {},
}));

vi.mock("./decoder.worker.js?worker&url", () => ({ default: "worker-url" }));

const JP2K_CODES = [33003, 33005, 34712];

describe("registerDecoders", () => {
  test("registers the JP2K decoder for every JPEG 2000 compression code", async () => {
    registerDecoders();

    for (const compression of JP2K_CODES) {
      const decoder = await getDecoder({ Compression: compression, BitsPerSample: [16] });
      expect(decoder.getDecoderId()).toBe("jp2k-decoder");
    }
  });

  test("is idempotent — repeat calls do not throw", () => {
    expect(() => {
      registerDecoders();
      registerDecoders();
    }).not.toThrow();
  });

  test("LZW (compression 5) still resolves to the LZW worker decoder", async () => {
    const decoder = await getDecoder({ Compression: 5, BitsPerSample: [16] });
    expect(decoder.getDecoderId()).toBe("lzw-decoder");
  });
});
