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

export function loadJp2KDecoder(decodeConfig?: unknown): Promise<void>;

export function decodeJPEG2000(
    compressedImageFrame: Uint8Array
): Promise<DecodedImage>;
