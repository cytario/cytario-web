import { GenericDecoder, FileDirectory } from "./genericDecoder";

/**
 * LZW (Lempel-Ziv-Welch) decoder implementation
 * Used for decoding LZW-compressed TIFF image data
 */
export class LZWDecoder extends GenericDecoder {
    constructor(fileDirectory: FileDirectory) {
        super(fileDirectory);
    }

    /**
     * Returns the decoder identifier for the worker pool
     */
    public getDecoderId(): string {
        return "lzw-decoder";
    }
}
