import { BaseDecoder } from "geotiff";

// Vite handles ?worker&url imports and provides the worker URL
// eslint-disable-next-line import/default
import DecoderWorkerUrl from "./decoder.worker.js?worker&url";
import { WorkerPool } from "./workerPool";

// Create a shared worker pool
const workerPool = new WorkerPool(DecoderWorkerUrl, 8);

// Cache for decoded blocks
const bufferCache = new Map<number, ArrayBuffer>();

export interface FileDirectory {
    TileWidth?: number;
    ImageWidth?: number;
    TileLength?: number;
    ImageLength?: number;
    BitsPerSample: number[];
}

export class GenericDecoder extends BaseDecoder {
    private maxUncompressedSize: number;

    constructor(fileDirectory: FileDirectory) {
        super();
        const width = fileDirectory.TileWidth || fileDirectory.ImageWidth || 0;
        const height =
            fileDirectory.TileLength || fileDirectory.ImageLength || 0;
        const nbytes = fileDirectory.BitsPerSample[0] / 8;

        this.maxUncompressedSize = width * height * nbytes;
    }

    async decodeBlock(inputBuffer: ArrayBuffer): Promise<ArrayBuffer> {
        const bufferHash = this.hashBuffer(inputBuffer); // Generate a hash for the buffer
        if (bufferCache.has(bufferHash)) {
            return bufferCache.get(bufferHash)!; // Return cached result
        }

        try {
            const outputBuffer = await workerPool.runTask({
                buffer: inputBuffer,
                maxUncompressedSize: this.maxUncompressedSize,
                decoderId: this.getDecoderId(),
            });

            bufferCache.set(bufferHash, outputBuffer); // Cache the result
            return outputBuffer;
        } catch (error) {
            console.error("Error decoding block:", error);
            throw error;
        }
    }

    public getDecoderId(): string {
        return "uninitialized-decoder";
    }


    // Simple hash function for ArrayBuffer
    private hashBuffer(buffer: ArrayBuffer): number {
        let hash = 0;
        const view = new Uint8Array(buffer);
        for (let i = 0; i < view.length; i++) {
            hash = (hash * 31 + view[i]) >>> 0; // Simple hash function
        }
        return hash;

    }
}
