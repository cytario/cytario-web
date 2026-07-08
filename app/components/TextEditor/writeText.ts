import { resolveResourceId } from "~/utils/connectionsStore/selectors";
import type { SignedFetch } from "~/utils/signedFetch";

/**
 * Write text content back to S3 via a SigV4-signed PUT. Uses the same
 * `createSignedFetch` pipeline as image-tile reads — the body is included
 * in the SigV4 signature so S3 accepts the PUT.
 */
export async function writeTextFile(
  resourceId: string,
  content: string,
  signedFetch: SignedFetch,
): Promise<void> {
  const { httpsUrl } = resolveResourceId(resourceId);
  const response = await signedFetch(httpsUrl, {
    method: "PUT",
    body: content,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Failed to write file (${response.status} ${response.statusText}): ${body}`);
  }
}
