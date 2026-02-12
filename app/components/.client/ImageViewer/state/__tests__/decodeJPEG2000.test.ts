import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { decodeJPEG2000 } from "../decodeJPEG2000";


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fixturePath = path.resolve(
    __dirname,
    "../../../../../__tests__/fixtures/images/aware.jp2",
);

const awareFixtureBytes = new Uint8Array(fs.readFileSync(fixturePath));


describe("decodeJPEG2000", () => {
    it("decodes a JPEG2000 image and returns the correct pixel data and frame info", async () => {
        const compressedImageFrame = new Uint8Array(awareFixtureBytes);
        const result = await decodeJPEG2000(compressedImageFrame);

        console.log(
            "[decodeJPEG2000] frame info:",
            result.info.height,
            result.info.width,
            result.info.componentCount,
            result.pixels.length,
            compressedImageFrame.length,
        );

        // Verify the decoder returns valid data structure
        expect(result).toBeDefined();
        expect(result.info).toBeDefined();
        expect(result.pixels).toBeInstanceOf(Uint8Array);

        // Verify frame dimensions are positive
        expect(result.info.height).toBe(3701);
        expect(result.info.width).toBe(2717);
        expect(result.info.componentCount).toBe(3);
        expect(result.info.bitsPerSample).toBe(8);

        // Verify pixel data matches expected size
        // For RGB image: width * height * componentCount
        const expectedPixelCount =
            result.info.width * result.info.height * result.info.componentCount;
        expect(result.pixels.length).toBe(expectedPixelCount);

        // Verify decoded data is larger than compressed data (as expected for uncompressed pixels)
        expect(result.pixels.length).toBeGreaterThan(
            compressedImageFrame.length,
        );
    });
});
