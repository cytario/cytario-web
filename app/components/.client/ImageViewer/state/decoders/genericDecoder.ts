import { BaseDecoder } from "geotiff";
import { LRUCache } from "lru-cache";

// Vite handles ?worker&url imports and provides the worker URL
// eslint-disable-next-line import/default
import DecoderWorkerUrl from "./decoder.worker.js?worker&url";
import { WorkerPool } from "./workerPool";

// Constants
const DEFAULT_WORKER_POOL_SIZE = 8;
/** Cached decoded blocks per image: ~256 MB of decoded pixel data. */
const MAX_CACHE_BYTES = 256 * 1024 * 1024;
const MAX_CACHE_ENTRY_BYTES = 64 * 1024 * 1024;

// Lazy worker pool — instantiated on first decode so module load stays
// side-effect free (test environments without Web Workers can import this
// module just to register the decoder class).
let workerPool: WorkerPool | null = null;
const getWorkerPool = (): WorkerPool => {
  if (!workerPool) {
    workerPool = new WorkerPool(DecoderWorkerUrl, DEFAULT_WORKER_POOL_SIZE);
  }
  return workerPool;
};

// Cache for decoded blocks with LRU eviction, bounded in bytes — decoded
// blocks scale with tile size (up to full frames for stripped TIFFs), so a
// count cap cannot bound memory.
const bufferCache = new LRUCache<number, ArrayBuffer>({
  maxSize: MAX_CACHE_BYTES,
  maxEntrySize: MAX_CACHE_ENTRY_BYTES,
  sizeCalculation: (buffer) => buffer.byteLength,
});

export interface FileDirectory {
  TileWidth?: number;
  TileLength?: number;
  ImageWidth?: number;
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

    if (!fileDirectory.BitsPerSample || fileDirectory.BitsPerSample.length === 0) {
      throw new Error("FileDirectory must have BitsPerSample defined");
    }

    const width = fileDirectory.TileWidth || fileDirectory.ImageWidth || 0;
    const height = fileDirectory.TileLength || fileDirectory.ImageLength || 0;
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
      const outputBuffer = await getWorkerPool().runTask({
        buffer: inputBuffer,
        maxUncompressedSize: this.maxUncompressedSize,
        decoderId: this.getDecoderId(),
      });

      // Cache the result
      bufferCache.set(bufferHash, outputBuffer);
      return outputBuffer;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
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
 * Drops cached decoded blocks without tearing down the pool (idle workers are
 * cheap; decoded pixel data is not). Memory-pressure reaction.
 */
export function trimDecoderCache(): void {
  bufferCache.clear();
}

/**
 * Terminates the worker pool and releases resources
 */
export function shutdownDecoderPool(): void {
  workerPool?.terminate();
  workerPool = null;
  bufferCache.clear();
}

export const __testHooks = {
  cacheSize: () => bufferCache.size,
  cachedBytes: () => bufferCache.calculatedSize,
  cacheGet: (hash: number) => bufferCache.get(hash),
  cacheSet: (hash: number, buffer: ArrayBuffer) => bufferCache.set(hash, buffer),
  reset: () => bufferCache.clear(),
};
