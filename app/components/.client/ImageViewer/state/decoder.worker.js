import { decompress } from "lzw-tiff-decoder";

import { decodeJPEG2000 } from "./decodeJPEG2000";

self.onmessage = async (event) => {
    const { taskId, buffer, maxUncompressedSize, decoderId } = event.data;

    try {
        const bytes = new Uint8Array(buffer);
        let pixels;
        if (decoderId === "lzw-decoder") {
            const decoded = await decompress(bytes, maxUncompressedSize);
            pixels = decoded.buffer;
        } else if (decoderId === "jp2k-decoder") {
            const image = await decodeJPEG2000(bytes);
            pixels = image.pixels.buffer;
        }
        self.postMessage({ taskId, result: pixels }, [ pixels ]);
    } catch (error) {
        self.postMessage({ taskId, error: error.message });
    }
};
