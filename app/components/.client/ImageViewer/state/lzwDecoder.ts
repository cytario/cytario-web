import { GenericDecoder, FileDirectory } from "./genericDecoder";

export class LZWDecoder extends GenericDecoder {

  constructor(fileDirectory: FileDirectory) {
    super(fileDirectory);
  }

  public getDecoderId(): string {
    return "lzw-decoder";
  }
}
