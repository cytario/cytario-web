import { GenericDecoder, FileDirectory } from "./genericDecoder";

/**
 * JPEG2000 (JP2K) decoder implementation
 * Used for decoding JPEG2000-compressed image data
 */
export class JP2KDecoder extends GenericDecoder {
    constructor(fileDirectory: FileDirectory) {
        super(fileDirectory);
    }

    /**
     * Returns the decoder identifier for the worker pool
     */
    public getDecoderId(): string {
        return "jp2k-decoder";
    }
}
