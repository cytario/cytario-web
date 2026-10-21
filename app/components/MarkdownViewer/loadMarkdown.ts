import { resolveResourceId } from "~/utils/connectionsStore/selectors";
import { readTextWithCap } from "~/utils/readTextWithCap";
import type { SignedFetch } from "~/utils/signedFetch";

export const MAX_MARKDOWN_BYTES = 50 * 1024 * 1024;

function markdownTooLarge(): Error {
  return new Error(
    `Markdown file exceeds the preview limit of ${MAX_MARKDOWN_BYTES / (1024 * 1024)} MB`,
  );
}

export async function loadMarkdownDocument(
  resourceId: string,
  signedFetch: SignedFetch,
): Promise<string> {
  const { httpsUrl } = resolveResourceId(resourceId);
  const response = await signedFetch(httpsUrl);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} loading markdown`);
  }
  return readTextWithCap(response, MAX_MARKDOWN_BYTES, markdownTooLarge);
}
