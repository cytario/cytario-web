/**
 * Module-level singleton so utility code (signedFetch, listObjectsClient) can
 * ask for fresh STS credentials without importing React. A route/component
 * that owns a `useRevalidator` installs the refresher at mount.
 */

import type { Credentials } from "@aws-sdk/client-sts";

/** Thrown when no refresher is installed or the refresh+retry still fails. */
export class ExpiredCredentialsError extends Error {
  public readonly connectionName?: string;

  constructor(message: string, connectionName?: string, cause?: unknown) {
    super(message);
    this.name = "ExpiredCredentialsError";
    this.connectionName = connectionName;
    if (cause !== undefined) {
      (this as { cause?: unknown }).cause = cause;
    }
  }
}

export type CredentialsRefresher = (connectionName: string) => Promise<Credentials>;

let installed: CredentialsRefresher | undefined;

/** Install the refresher. Returns an uninstall function for React cleanup. */
export function setCredentialsRefresher(refresher: CredentialsRefresher): () => void {
  installed = refresher;
  return () => {
    if (installed === refresher) installed = undefined;
  };
}

/** Trigger a refresh; throws `ExpiredCredentialsError` if none is installed or it fails. */
export async function requestCredentialsRefresh(connectionName: string): Promise<Credentials> {
  if (!installed) {
    throw new ExpiredCredentialsError(
      "STS credentials expired and no refresher is installed.",
      connectionName,
    );
  }
  try {
    return await installed(connectionName);
  } catch (error) {
    throw new ExpiredCredentialsError("Failed to refresh STS credentials.", connectionName, error);
  }
}

/** Test-only — module state survives `vi.resetModules()` unless explicitly wiped. */
export function __resetCredentialsRefresher(): void {
  installed = undefined;
}
