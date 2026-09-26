import type { Image } from "./image";

/**
 * Client-side image metadata — lets a plugin resolve a storage object to its
 * format-agnostic image characteristics (the same `Image` every `load()`
 * returns) and its byte size, without opening a viewer or decoding pixels.
 * The host resolves the connection, signs the read, and hides the fallback
 * chain (a handler without a cheap metadata read falls back to its `load()`;
 * any failure resolves `null`, never throws).
 *
 * Client-live; `null` in the server realm (reached through `ctx.client`).
 */
export interface ImageMetadata {
  /**
   * The object's image metadata, or `null` when the format is unsupported,
   * the connection is unresolvable, or the read fails.
   */
  read(connectionId: string, path: string): Promise<Image | null>;
  /** The object's byte size, or `null` when it cannot be determined. */
  size(connectionId: string, path: string): Promise<number | null>;
}
