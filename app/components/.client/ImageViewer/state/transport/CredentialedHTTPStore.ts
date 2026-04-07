import type { SignedFetch } from "~/utils/signedFetch";

/**
 * A zarr-compatible HTTP store that signs requests with AWS Signature V4.
 * Implements zarrita's AsyncReadable interface for use with loadOmeZarrFromStore.
 */
export class CredentialedHTTPStore {
  private baseUrl: URL;
  private signedFetch: SignedFetch;

  constructor(url: string, signedFetch: SignedFetch) {
    this.baseUrl = new URL(url.endsWith("/") ? url : url + "/");
    this.signedFetch = signedFetch;
  }

  /** Fetch a key from the store with signed request. Returns undefined for 404. */
  async get(key: string): Promise<Uint8Array | undefined> {
    const url = new URL(key.replace(/^\//, ""), this.baseUrl);

    const response = await this.signedFetch(url.toString());

    if (response.status === 404) return undefined;

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(`HTTP ${response.status} fetching ${key}: ${errorText}`);
    }

    return new Uint8Array(await response.arrayBuffer());
  }
}
