import type { _Object } from "@aws-sdk/client-s3";
import type { Credentials } from "@aws-sdk/client-sts";

import { getFileCategory } from "~/utils/fileType";
import type { ConnectionAddress } from "~/utils/listObjects/listObjectsClient";
import { listObjectsClient } from "~/utils/listObjects/listObjectsClient";
import { getPrefix } from "~/utils/pathUtils";

const PREVIEW_MAX_KEYS = 100;
const PREVIEW_MAX_TOTAL = 100;

const isImagePreview = (obj: _Object) => getFileCategory(obj.Key ?? "") === "image";

/**
 * Recursively lists objects under `prefix` and returns the first imageable
 * one. `findFirst` short-circuits pagination on the first match so only
 * pages up to the hit are fetched. Throws on listing failure — callers
 * decide how to handle errors (CORS detection, swallow, etc.).
 */
export async function findFirstImage(
  address: ConnectionAddress,
  credentials: Credentials,
  prefix: string | undefined,
  signal?: AbortSignal,
): Promise<_Object | undefined> {
  const { contents } = await listObjectsClient(address, credentials, {
    prefix: getPrefix(prefix ?? ""),
    recursive: true,
    maxKeys: PREVIEW_MAX_KEYS,
    maxTotal: PREVIEW_MAX_TOTAL,
    findFirst: isImagePreview,
    signal,
  });
  return contents.find(isImagePreview);
}
