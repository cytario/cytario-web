export interface FrameInfo {
  width: number;
  height: number;
  componentCount: number;
  bitsPerSample: number;
  isSigned: boolean;
  isReversible: boolean;
}

export interface DecodedImage {
  info: FrameInfo;
  pixels: Uint8Array;
}

/** Loads the JPEG2000 decoder WASM module. */
export function loadJp2KDecoder(decodeConfig?: unknown): Promise<void>;

/** Decodes a JPEG2000 compressed image frame.
 *  @throws Error if the compressed frame is invalid or decoding fails. */
export function decodeJPEG2000(compressedImageFrame: Uint8Array): Promise<DecodedImage>;

/** Releases decoder resources. */
export function cleanupJp2KDecoder(): void;
