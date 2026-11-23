interface Slice {
  offset: number;
  length: number;
}

/** geotiff's source contract (`BaseSource`), which it does not export as a type. */
export interface TiffSource {
  fetch(slices: Slice[], signal?: AbortSignal): Promise<ArrayBuffer[]>;
  readonly fileSize: number | null;
}

/** geotiff's client contract, satisfied by `SigV4TiffClient` and `BlobTiffClient`. */
export interface TiffClient {
  request(options: { headers?: HeadersInit; signal?: AbortSignal }): Promise<{
    ok: boolean;
    status: number;
    getData: () => Promise<ArrayBuffer> | ArrayBuffer;
  }>;
}

/**
 * Sends tile reads straight to the client, one exact range per tile, and
 * everything else through geotiff's block cache.
 *
 * geotiff passes a signal only when reading tile data (`getTileOrStrip`), never
 * for IFD or header reads. The block cache merges concurrent reads into shared
 * requests carrying the first caller's signal, so aborting one tile there fails
 * its neighbours too. Tile reads skip it so each tile's abort cancels exactly
 * its own request; small metadata reads keep the block cache.
 */
export class SignalRoutedTiffSource implements TiffSource {
  constructor(
    private readonly blockedSource: TiffSource,
    private readonly client: TiffClient,
  ) {}

  get fileSize(): number | null {
    return this.blockedSource.fileSize;
  }

  fetch(slices: Slice[], signal?: AbortSignal): Promise<ArrayBuffer[]> {
    if (!signal) return this.blockedSource.fetch(slices);
    return Promise.all(slices.map((slice) => this.fetchSlice(slice, signal)));
  }

  private async fetchSlice({ offset, length }: Slice, signal: AbortSignal): Promise<ArrayBuffer> {
    const response = await this.client.request({
      headers: { Range: `bytes=${offset}-${offset + length - 1}` },
      signal,
    });
    if (!response.ok || response.status !== 206) {
      throw new Error(`Tile range request failed with status ${response.status}`);
    }
    const data = await response.getData();
    return data.byteLength > length ? data.slice(0, length) : data;
  }
}
