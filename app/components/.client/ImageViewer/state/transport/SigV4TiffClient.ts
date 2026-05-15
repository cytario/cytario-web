import type { SignedFetch } from "~/utils/signedFetch";

/**
 * A geotiff-compatible HTTP client that signs range requests with AWS SigV4.
 * Implements geotiff's BaseClient interface for use with fromCustomClient().
 *
 * `extraHeaders` carries headers supplied by the caller via
 * `LoadOptions.headers` (per SDS-CY-010050). They are merged INTO the
 * per-request headers geotiff passes (e.g. `Range`) so the per-request
 * `Range` always wins — caller-supplied headers describe load-wide
 * intent (Accept, If-None-Match, Cache-Control), not byte ranges.
 */
export class SigV4TiffClient {
  url: string;
  private signedFetch: SignedFetch;
  private extraHeaders: Record<string, string>;

  constructor(
    url: string,
    signedFetch: SignedFetch,
    extraHeaders?: Record<string, string>,
  ) {
    this.url = url;
    this.signedFetch = signedFetch;
    this.extraHeaders = extraHeaders ?? {};
  }

  async request({
    headers,
    signal,
  }: { headers?: HeadersInit; signal?: AbortSignal } = {}) {
    const response = await this.signedFetch(this.url, {
      headers: {
        ...this.extraHeaders,
        ...(headers as Record<string, string> | undefined),
      },
      signal,
    });

    return {
      ok: response.ok,
      status: response.status,
      getHeader: (name: string) => response.headers.get(name) ?? "",
      getData: () => response.arrayBuffer(),
    };
  }
}
