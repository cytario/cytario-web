import { BaseDecoder } from "geotiff";

import { decodeJPEG2000 } from "./decodeJPEG2000";

interface FileDirectory {
    TileWidth?: number;
    TileLength?: number;
    ImageWidth: number;
    ImageLength: number;
    BitsPerSample: number[];
}

export class JP2KDecoder extends BaseDecoder {
    maxUncompressedSize: number;

    constructor(fileDirectory: FileDirectory) {
        console.log(
            "JP2KDecoder: Initializing with file directory",
            fileDirectory,
        );
        super();
        const width = fileDirectory.TileWidth || fileDirectory.ImageWidth;
        const height = fileDirectory.TileLength || fileDirectory.ImageLength;
        const nbytes = fileDirectory.BitsPerSample[0] / 8;
        this.maxUncompressedSize = width * height * nbytes;
    }

    async decodeBlock(buffer: ArrayBuffer) {
        console.log(
            "JP2KDecoder: Returning zero-filled block for size",
            buffer.byteLength,
        );
        const outputLength = this.maxUncompressedSize || buffer.byteLength;
        const zeroFilled = new Uint8Array(outputLength);
        return zeroFilled.buffer;
    }

    async decodeBlock2(buffer: ArrayBuffer) {
        console.log("JP2KDecoder: Decoding block of size", buffer.byteLength);
        const image = await decodeJPEG2000(new Uint8Array(buffer));
        console.log("JP2KDecoder: Decoded image info", image.info);
        return image.pixels.buffer;
    }

}
