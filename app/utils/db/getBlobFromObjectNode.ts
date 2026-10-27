import { liveCredentials, resolveResourceId } from "../connectionsStore/selectors";
import { createSignedFetch } from "../signedFetch";

/**
 * Stream a response body into a `Uint8Array`.
 *
 * `no-store` on the fetch: whole-object reads must not be served from the
 * browser HTTP cache — S3 objects are overwritten in place, and a cached
 * response would serve the previous version of the file.
 */
export async function getUint8ArrayForResourceId(resourceId: string): Promise<Uint8Array> {
  const { connectionId, httpsUrl, region } = resolveResourceId(resourceId);
  // Live getter: a download outliving the STS credentials can refresh and
  // retry instead of failing on ExpiredToken.
  const signedFetch = createSignedFetch(liveCredentials(connectionId), region, connectionId);

  const response = await signedFetch(httpsUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to fetch file: ${response.statusText}`);
  }

  if (!response.body) {
    throw new Error("Response body is null");
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
  }

  const combined = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }
  return combined;
}
