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
 *
 * Transient range-request failures are retried with exponential backoff +
 * jitter. geotiff's BlockedSource aggregates any single failed block into
 * an AggregateError that poisons the whole IFD parse, and geotiff itself
 * does not retry HTTP errors — so the retry must live here.
 */

export interface SigV4TiffClientRetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 100;
const DEFAULT_MAX_DELAY_MS = 2000;

function isTransientStatus(status: number): boolean {
  return status === 408 || status === 429 || (status >= 500 && status <= 599);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function backoffDelayMs(attempt: number, baseMs: number, maxMs: number): number {
  const exp = Math.min(maxMs, baseMs * 2 ** attempt);
  return exp / 2 + Math.random() * (exp / 2);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export class SigV4TiffClient {
  url: string;
  private signedFetch: SignedFetch;
  private extraHeaders: Record<string, string>;
  private maxAttempts: number;
  private baseDelayMs: number;
  private maxDelayMs: number;

  constructor(
    url: string,
    signedFetch: SignedFetch,
    extraHeaders?: Record<string, string>,
    retry?: SigV4TiffClientRetryOptions,
  ) {
    this.url = url;
    this.signedFetch = signedFetch;
    this.extraHeaders = extraHeaders ?? {};
    this.maxAttempts = Math.max(1, retry?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
    this.baseDelayMs = retry?.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
    this.maxDelayMs = retry?.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  }

  async request({ headers, signal }: { headers?: HeadersInit; signal?: AbortSignal } = {}) {
    const mergedHeaders = {
      ...this.extraHeaders,
      ...(headers as Record<string, string> | undefined),
    };

    let lastError: unknown;
    for (let attempt = 0; attempt < this.maxAttempts; attempt++) {
      if (signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }

      try {
        const response = await this.signedFetch(this.url, {
          headers: mergedHeaders,
          signal,
        });

        if (!response.ok && isTransientStatus(response.status) && attempt < this.maxAttempts - 1) {
          lastError = new Error(`Transient HTTP ${response.status} from ${this.url}`);
          await sleep(backoffDelayMs(attempt, this.baseDelayMs, this.maxDelayMs), signal);
          continue;
        }

        return {
          ok: response.ok,
          status: response.status,
          getHeader: (name: string) => response.headers.get(name) ?? "",
          getData: () => response.arrayBuffer(),
        };
      } catch (error) {
        if (isAbortError(error)) throw error;
        lastError = error;
        if (attempt >= this.maxAttempts - 1) throw error;
        await sleep(backoffDelayMs(attempt, this.baseDelayMs, this.maxDelayMs), signal);
      }
    }

    throw lastError ?? new Error("SigV4TiffClient: retry loop exhausted without result");
  }
}
