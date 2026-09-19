import { resolveResourceId } from "~/utils/connectionsStore/selectors";
import type { SignedFetch } from "~/utils/signedFetch";

/** The body must be part of the SigV4 signature or S3 rejects the PUT. */
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
