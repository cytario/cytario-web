import { Credentials } from "@aws-sdk/client-sts";
import { useEffect, useRef } from "react";
import { useRevalidator } from "react-router";

import { useConnectionsStore } from "~/utils/connectionsStore/useConnectionsStore";
import { setCredentialsRefresher } from "~/utils/credentialsRefresh";

/**
 * Revalidate slightly inside the server's 5-minute STS staleness buffer
 * (`isValidCredentials`) so credentials rotate before they expire, and well
 * inside Keycloak's SSO idle timeout so the session survives long viewer
 * stretches that produce no other server traffic (reads are browser→S3).
 */
const KEEP_ALIVE_INTERVAL_MS = 4 * 60 * 1000;

/** How long to wait for a revalidation to land rotated credentials in the store. */
const STORE_UPDATE_TIMEOUT_MS = 5_000;

/**
 * Resolves once the store holds credentials for `connectionName` with a
 * different `AccessKeyId` than `previousKeyId`; `null` on timeout. The store
 * is written by `useInitConnections` in an effect, so the update can land
 * after the revalidation promise settles.
 */
const waitForRotatedCredentials = (
  connectionName: string,
  previousKeyId: string | undefined,
  timeoutMs: number,
): Promise<Credentials | null> =>
  new Promise((resolve) => {
    const read = () => {
      const credentials = useConnectionsStore.getState().connections[connectionName]?.credentials;
      return credentials && credentials.AccessKeyId !== previousKeyId ? credentials : null;
    };

    const immediate = read();
    if (immediate) {
      resolve(immediate);
      return;
    }

    const cleanup = () => {
      clearTimeout(timer);
      unsubscribe();
    };
    const unsubscribe = useConnectionsStore.subscribe(() => {
      const rotated = read();
      if (rotated) {
        cleanup();
        resolve(rotated);
      }
    });
    const timer = setTimeout(() => {
      cleanup();
      resolve(null);
    }, timeoutMs);
  });

/**
 * Keeps STS credentials and the Keycloak session alive (C-242).
 *
 * Installs the `credentialsRefresh` refresher so the `signedFetch` /
 * `listObjectsClient` ExpiredToken retry path can re-mint credentials: a
 * revalidation re-runs the protected-layout loader, the auth middleware
 * refreshes stale STS credentials (and Keycloak tokens), and
 * `useInitConnections` lands them in the connections store.
 *
 * Additionally revalidates on an interval so rotation happens proactively —
 * consumers without a retry path (DuckDB-WASM reads) never see expired
 * credentials, and the Keycloak session never idles out mid-use.
 */
export function useCredentialsKeepAlive() {
  const revalidator = useRevalidator();
  // Latest-ref so the once-installed refresher/interval never call a stale
  // `revalidate` from a previous render.
  const revalidateRef = useRef(revalidator.revalidate);
  useEffect(() => {
    revalidateRef.current = revalidator.revalidate;
  });

  const inFlightRef = useRef<Promise<void> | null>(null);
  const lastRunRef = useRef(0);

  useEffect(() => {
    // Loader data is fresh at mount — don't let the visibility handler fire early.
    lastRunRef.current = Date.now();

    // Single-flight: a burst of expired tile reads triggers one revalidation.
    const revalidateOnce = () => {
      if (!inFlightRef.current) {
        lastRunRef.current = Date.now();
        inFlightRef.current = Promise.resolve(revalidateRef.current()).finally(() => {
          inFlightRef.current = null;
        });
      }
      return inFlightRef.current;
    };

    const uninstall = setCredentialsRefresher(async (connectionName) => {
      const previousKeyId =
        useConnectionsStore.getState().connections[connectionName]?.credentials?.AccessKeyId;

      await revalidateOnce();

      const rotated = await waitForRotatedCredentials(
        connectionName,
        previousKeyId,
        STORE_UPDATE_TIMEOUT_MS,
      );
      if (rotated) return rotated;

      // No rotation observed — return what the store holds; the caller's
      // retry surfaces ExpiredCredentialsError if it is still stale.
      const current = useConnectionsStore.getState().connections[connectionName]?.credentials;
      if (!current) {
        throw new Error(`No credentials for connection "${connectionName}" after refresh.`);
      }
      return current;
    });

    const interval = setInterval(revalidateOnce, KEEP_ALIVE_INTERVAL_MS);

    // Browsers throttle interval timers in hidden tabs — catch up on return.
    const onVisibilityChange = () => {
      if (
        document.visibilityState === "visible" &&
        Date.now() - lastRunRef.current > KEEP_ALIVE_INTERVAL_MS
      ) {
        revalidateOnce();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      uninstall();
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);
}
