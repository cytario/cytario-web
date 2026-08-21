import { fromCustomClient } from "geotiff";

import { SigV4TiffClient } from "../transport/SigV4TiffClient";
import type { SignedFetch } from "~/utils/signedFetch";

/**
 * Walks the main IFD chain of a remote TIFF via SigV4-signed range requests
 * and returns the byte offset of every IFD in chain order. The result matches
 * the Version 0 IFD Index spec used by viv's `createOffsetsProxy`.
 *
 * This is the same approach as hms-dbmi/generate-tiff-offsets' web app, but
 * uses our SigV4TiffClient so it works against private S3 buckets.
 */
export async function generateTiffOffsets(
  s3Url: string,
  signedFetch: SignedFetch,
): Promise<number[]> {
  const client = new SigV4TiffClient(s3Url, signedFetch);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tiff = await fromCustomClient(client as any, {
    cacheSize: Number.POSITIVE_INFINITY,
  });

  const offsets: number[] = [];
  let offset = tiff.firstIFDOffset;
  let count = 0;
  while (offset !== 0 && count < 10000) {
    offsets.push(offset);
    const ifd = await tiff.parseFileDirectoryAt(offset);
    offset = ifd.nextIFDByteOffset;
    count++;
  }
  return offsets;
}
