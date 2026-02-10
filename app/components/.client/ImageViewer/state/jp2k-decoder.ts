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
        const image = await decodeJPEG2000(new Uint8Array(buffer));
        return image.pixels.buffer;
    }

}
