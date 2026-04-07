import { BaseDecoder } from "geotiff";
import { LRUCache } from "lru-cache";

// Vite handles ?worker&url imports and provides the worker URL
// eslint-disable-next-line import/default
import DecoderWorkerUrl from "./decoder.worker.js?worker&url";
import { WorkerPool } from "./workerPool";

// Constants
const DEFAULT_WORKER_POOL_SIZE = 8;
const CACHE_SIZE_LIMIT = 1000; // Limit cache to prevent memory leaks

// Create a shared worker pool
const workerPool = new WorkerPool(DecoderWorkerUrl, DEFAULT_WORKER_POOL_SIZE);

// Cache for decoded blocks with LRU eviction
const bufferCache = new LRUCache<number, ArrayBuffer>({
    max: CACHE_SIZE_LIMIT,
});

export interface FileDirectory {
    TileWidth?: number;
    ImageWidth?: number;
    TileLength?: number;
    ImageLength?: number;
    BitsPerSample: number[];
}

/**
 * Base decoder class for handling image block decoding with worker pool and caching
 */
export class GenericDecoder extends BaseDecoder {
    private readonly maxUncompressedSize: number;

    constructor(fileDirectory: FileDirectory) {
        super();

        if (
            !fileDirectory.BitsPerSample ||
            fileDirectory.BitsPerSample.length === 0
        ) {
            throw new Error("FileDirectory must have BitsPerSample defined");
        }

        const width = fileDirectory.TileWidth || fileDirectory.ImageWidth || 0;
        const height =
            fileDirectory.TileLength || fileDirectory.ImageLength || 0;
        const nbytes = fileDirectory.BitsPerSample[0] / 8;

        this.maxUncompressedSize = width * height * nbytes;
    }

    /**
     * Decodes a compressed image block using worker pool and caching
     * @param inputBuffer - The compressed image block
     * @returns Decoded image buffer
     */
    async decodeBlock(inputBuffer: ArrayBuffer): Promise<ArrayBuffer> {
        if (!inputBuffer || inputBuffer.byteLength === 0) {
            throw new Error("Invalid input buffer: empty or null");
        }

        const bufferHash = this.hashBuffer(inputBuffer);

        // Check cache first
        const cachedResult = bufferCache.get(bufferHash);
        if (cachedResult) {
            return cachedResult;
        }

        try {
            const outputBuffer = await workerPool.runTask({
                buffer: inputBuffer,
                maxUncompressedSize: this.maxUncompressedSize,
                decoderId: this.getDecoderId(),
            });

            // Cache the result
            bufferCache.set(bufferHash, outputBuffer);
            return outputBuffer;
        } catch (error) {
            const errorMessage =
                error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to decode block: ${errorMessage}`);
        }
    }

    /**
     * Returns the decoder identifier (must be overridden by subclasses)
     */
    public getDecoderId(): string {
        return "uninitialized-decoder";
    }

    /**
     * FNV-1a hash function for ArrayBuffer - faster and better distribution than simple hash
     * @param buffer - The buffer to hash
     * @returns Hash value
     */
    private hashBuffer(buffer: ArrayBuffer): number {
        const FNV_OFFSET_BASIS = 2166136261;
        const FNV_PRIME = 16777619;

        let hash = FNV_OFFSET_BASIS;
        const view = new Uint8Array(buffer);
        const len = view.length;

        for (let i = 0; i < len; i++) {
            hash ^= view[i];
            hash = Math.imul(hash, FNV_PRIME);
        }

        return hash >>> 0; // Convert to unsigned 32-bit integer
    }
}

/**
 * Clears the decoder cache
 */
export function clearDecoderCache(): void {
    bufferCache.clear();
}

/**
 * Terminates the worker pool and releases resources
 */
export function shutdownDecoderPool(): void {
    workerPool.terminate();
    bufferCache.clear();
}
