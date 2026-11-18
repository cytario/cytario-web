import type { SignedFetch } from "~/utils/signedFetch";

/**
 * Chunk keys the store was asked for and did not find. zarrita turns a missing
 * chunk into a filled tile (`fill_value`, 0 for uint16) — legitimate for a
 * sparse array, but indistinguishable from an incomplete pyramid, where it
 * renders as black tissue with no error anywhere. Counting them lets a caller
 * say so instead of exporting a silently empty image.
 */
const missingChunks = new Set<string>();

/** Missing chunk keys seen since the last {@link resetMissingChunks}. */
export const getMissingChunks = (): string[] => [...missingChunks];

export const resetMissingChunks = (): void => {
  missingChunks.clear();
};

/**
 * A zarr-compatible HTTP store that signs requests with AWS Signature V4.
 * Implements zarrita's AsyncReadable interface for use with loadOmeZarrFromStore.
 *
 * `extraHeaders` carries headers supplied by the caller via
 * `LoadOptions.headers` (per SDS-CY-010050). They are passed through on
 * every chunk fetch the store issues.
 */
export class CredentialedHTTPStore {
  private baseUrl: URL;
  private signedFetch: SignedFetch;
  private extraHeaders: Record<string, string>;

  constructor(url: string, signedFetch: SignedFetch, extraHeaders?: Record<string, string>) {
    this.baseUrl = new URL(url.endsWith("/") ? url : url + "/");
    this.signedFetch = signedFetch;
    this.extraHeaders = extraHeaders ?? {};
  }

  /** Fetch a key from the store with signed request. Returns undefined for 404. */
  async get(key: string): Promise<Uint8Array | undefined> {
    const url = new URL(key.replace(/^\//, ""), this.baseUrl);

    const response = await this.signedFetch(url.toString(), {
      headers: this.extraHeaders,
    });

    if (response.status === 404) {
      missingChunks.add(key);
      return undefined;
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(`HTTP ${response.status} fetching ${key}: ${errorText}`);
    }

    return new Uint8Array(await response.arrayBuffer());
  }
}
