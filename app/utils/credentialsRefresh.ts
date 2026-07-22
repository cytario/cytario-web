/**
 * Module-level singleton so utility code (signedFetch, listObjectsClient) can
 * ask for fresh STS credentials without importing React. A route/component
 * that owns a `useRevalidator` installs the refresher at mount.
 */

import type { Credentials } from "@aws-sdk/client-sts";

/**
 * How long before STS expiry the server treats credentials as stale and
 * re-mints them (`isValidCredentials`). The client keep-alive interval must
 * stay below this so one revalidation always lands inside the window.
 */
export const STS_STALENESS_BUFFER_MS = 5 * 60 * 1000;

/** Thrown when no refresher is installed or the refresh+retry still fails. */
export class ExpiredCredentialsError extends Error {
  public readonly connectionId?: string;

  constructor(message: string, connectionId?: string, cause?: unknown) {
    super(message);
    this.name = "ExpiredCredentialsError";
    this.connectionId = connectionId;
    if (cause !== undefined) {
      (this as { cause?: unknown }).cause = cause;
    }
  }
}

export type CredentialsRefresher = (connectionId: string) => Promise<Credentials>;

let installed: CredentialsRefresher | undefined;

/** Install the refresher. Returns an uninstall function for React cleanup. */
export function setCredentialsRefresher(refresher: CredentialsRefresher): () => void {
  installed = refresher;
  return () => {
    if (installed === refresher) installed = undefined;
  };
}

/** Trigger a refresh; throws `ExpiredCredentialsError` if none is installed or it fails. */
export async function requestCredentialsRefresh(connectionId: string): Promise<Credentials> {
  if (!installed) {
    throw new ExpiredCredentialsError(
      "STS credentials expired and no refresher is installed.",
      connectionId,
    );
  }
  try {
    return await installed(connectionId);
  } catch (error) {
    throw new ExpiredCredentialsError("Failed to refresh STS credentials.", connectionId, error);
  }
}

/** Test-only — module state survives `vi.resetModules()` unless explicitly wiped. */
export function __resetCredentialsRefresher(): void {
  installed = undefined;
}
