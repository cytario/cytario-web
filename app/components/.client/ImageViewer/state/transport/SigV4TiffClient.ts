import type { SignedFetch } from "~/utils/signedFetch";

/**
 * A geotiff-compatible HTTP client that signs range requests with AWS SigV4.
 * Implements geotiff's BaseClient interface for use with fromCustomClient().
 */
export class SigV4TiffClient {
  url: string;
  private signedFetch: SignedFetch;

  constructor(url: string, signedFetch: SignedFetch) {
    this.url = url;
    this.signedFetch = signedFetch;
  }

  async request({
    headers,
    signal,
  }: { headers?: HeadersInit; signal?: AbortSignal } = {}) {
    const response = await this.signedFetch(this.url, {
      headers: headers as Record<string, string>,
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
