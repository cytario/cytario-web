import { GenericDecoder, FileDirectory } from "./genericDecoder";


export class JP2KDecoder extends GenericDecoder {

    constructor(fileDirectory: FileDirectory) {
        super(fileDirectory);
    }

    public getDecoderId(): string {
        return "jp2k-decoder";
    }

}
