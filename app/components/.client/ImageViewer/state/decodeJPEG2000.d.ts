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

/**
 * Loads the JPEG2000 decoder WASM module
 * @param decodeConfig - Optional decoder configuration
 * @returns Promise that resolves when the decoder is loaded
 */
export function loadJp2KDecoder(decodeConfig?: unknown): Promise<void>;

/**
 * Decodes a JPEG2000 compressed image frame
 * @param compressedImageFrame - The compressed image data
 * @returns Promise resolving to decoded image data with frame info and pixels
 * @throws Error if the compressed frame is invalid or decoding fails
 */
export function decodeJPEG2000(
    compressedImageFrame: Uint8Array,
): Promise<DecodedImage>;

/**
 * Cleanup function to release decoder resources
 */
export function cleanupJp2KDecoder(): void;
