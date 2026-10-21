import { resolveResourceId } from "~/utils/connectionsStore/selectors";
import type { SignedFetch } from "~/utils/signedFetch";

/** Entry document cap — consistent with the HTML Report Viewer's entry cap. */
export const MAX_MARKDOWN_BYTES = 50 * 1024 * 1024;

interface MarkdownSizeError extends Error {
  readonly code: "markdown-too-large";
}

export function isMarkdownSizeError(error: unknown): error is MarkdownSizeError {
  return error instanceof Error && (error as MarkdownSizeError).code === "markdown-too-large";
}

function markdownTooLarge(): MarkdownSizeError {
  const error = new Error(
    `Markdown file exceeds the preview limit of ${MAX_MARKDOWN_BYTES / (1024 * 1024)} MB`,
  );
  Object.defineProperty(error, "code", { value: "markdown-too-large" });
  return error as MarkdownSizeError;
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
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > MAX_MARKDOWN_BYTES) {
    throw markdownTooLarge();
  }
  const markdown = new TextDecoder("utf-8").decode(await response.arrayBuffer());
  if (markdown.length > MAX_MARKDOWN_BYTES) {
    throw markdownTooLarge();
  }
  return markdown;
}
