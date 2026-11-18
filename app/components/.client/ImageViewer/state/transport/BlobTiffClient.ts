import type { LocalFileSource } from "@cytario/plugin-api";

/**
 * A geotiff-compatible client that reads a locally-opened file by slicing it
 * on demand — the BaseClient/BaseResponse contract SigV4TiffClient satisfies
 * for HTTP, answered from `blob.slice` instead of a network request.
 */
export class BlobTiffClient {
  url: string;
  private source: LocalFileSource;

  constructor(fileName: string, source: LocalFileSource) {
    this.url = fileName;
    this.source = source;
  }

  async request({ headers, signal }: { headers?: HeadersInit; signal?: AbortSignal } = {}) {
    if (signal?.aborted) {
      throw new DOMException("The operation was aborted.", "AbortError");
    }
    // geotiff passes byte offsets as a `Range: bytes=start-end` header.
    const rangeHeader = new Headers(headers).get("range") ?? "bytes=0-";
    const match = /bytes=(\d+)-(\d*)/.exec(rangeHeader);
    if (!match) {
      throw new Error(`BlobTiffClient: unsupported Range header: ${rangeHeader}`);
    }
    const start = Number(match[1]);
    const end = match[2] === "" ? this.source.size - 1 : Number(match[2]);
    const buffer = await this.source.slice(start, end + 1).arrayBuffer();

    return {
      ok: true,
      status: 206,
      getHeader: () => "",
      getData: () => buffer,
    };
  }
}
