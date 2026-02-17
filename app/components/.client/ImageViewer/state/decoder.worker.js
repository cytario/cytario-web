import { decompress } from "lzw-tiff-decoder";

import { decodeJPEG2000, cleanupJp2KDecoder } from "./decodeJPEG2000";

/**
 * Decoder types supported by this worker
 */
const DECODER_TYPES = {
    LZW: "lzw-decoder",
    JP2K: "jp2k-decoder",
};

/**
 * Worker message handler for image decoding tasks
 */
self.onmessage = async (event) => {
    const { taskId, buffer, maxUncompressedSize, decoderId } = event.data;

    // Validate input
    if (!taskId) {
        self.postMessage({ 
            taskId: 'unknown', 
            error: 'Missing taskId in worker message' 
        });
        return;
    }

    if (!buffer || !decoderId) {
        self.postMessage({ 
            taskId, 
            error: 'Missing required parameters: buffer or decoderId' 
        });
        return;
    }

    try {
        const bytes = new Uint8Array(buffer);
        let pixels;

        switch (decoderId) {
            case DECODER_TYPES.LZW: {
                if (!maxUncompressedSize) {
                    throw new Error('maxUncompressedSize required for LZW decoder');
                }
                const decoded = await decompress(bytes, maxUncompressedSize);
                pixels = decoded.buffer;
                break;
            }

            case DECODER_TYPES.JP2K: {
                const image = await decodeJPEG2000(bytes);
                pixels = image.pixels.buffer;
                break;
            }

            default:
                throw new Error(`Unknown decoder type: ${decoderId}`);
        }

        // Transfer the ArrayBuffer to avoid copying
        self.postMessage({ taskId, result: pixels }, [pixels]);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        self.postMessage({ 
            taskId, 
            error: errorMessage 
        });
    }
};

/**
 * Cleanup when worker is being terminated
 */
self.addEventListener('close', () => {
    cleanupJp2KDecoder();
});
