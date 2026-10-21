/**
 * Reads a response body as UTF-8 text, rejecting it when it exceeds the byte
 * cap — by `content-length` when present, otherwise by the decoded length.
 */
export async function readTextWithCap(
  response: Response,
  maxBytes: number,
  tooLarge: () => Error,
): Promise<string> {
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > maxBytes) throw tooLarge();
  const text = new TextDecoder("utf-8").decode(await response.arrayBuffer());
  if (text.length > maxBytes) throw tooLarge();
  return text;
}
