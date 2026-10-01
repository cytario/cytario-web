import { resolveResourceId } from "../connectionsStore/selectors";
import { constructS3Url, s3KeyFromUri } from "../resourceId";
import { getSidecarKey } from "../sidecarKey";
import { createSignedFetch } from "../signedFetch";

/**
 * Deletes one annotation set's sidecar from S3. The duckdb-wasm COPY write
 * path cannot delete objects, so this goes through a signed-fetch DELETE.
 * S3 DELETE is idempotent (204 also for a missing key), so a retry after a
 * partially-completed flush is safe.
 */
export async function deleteAnnotations(resourceId: string, setId: string): Promise<void> {
  const { credentials, region, endpoint, s3Uri, connectionConfig } = resolveResourceId(resourceId);

  const sidecarUri = getSidecarKey(s3Uri, "annotations", setId);
  const url = constructS3Url(
    { bucketName: connectionConfig.bucketName, region, endpoint },
    s3KeyFromUri(sidecarUri),
  );

  const signedFetch = createSignedFetch(() => credentials, region);
  const response = await signedFetch(url, { method: "DELETE" });
  if (!response.ok) {
    throw new Error(`Failed to delete the annotation sidecar (HTTP ${response.status})`);
  }
}
