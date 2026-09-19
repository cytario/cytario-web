import { Credentials } from "@aws-sdk/client-sts";
import { useEffect, useRef } from "react";
import { useRevalidator } from "react-router";

import { liveCredentials } from "~/utils/connectionsStore/selectors";
import { useConnectionsStore } from "~/utils/connectionsStore/useConnectionsStore";
import { setCredentialsRefresher, STS_STALENESS_BUFFER_MS } from "~/utils/credentialsRefresh";

/**
 * Revalidate inside the server's STS staleness buffer so rotation happens
 * before expiry; each tick also keeps the Keycloak session inside its idle
 * timeout (viewer stretches produce no other server traffic).
 */
const KEEP_ALIVE_INTERVAL_MS = STS_STALENESS_BUFFER_MS - 60 * 1000;

/** How long to wait for a revalidation to land rotated credentials in the store. */
const STORE_UPDATE_TIMEOUT_MS = 5_000;

/** Resolves once the store holds credentials with a different `AccessKeyId`; the
 * store write can land after the revalidation promise settles. */
const waitForRotatedCredentials = (
  connectionId: string,
  previousKeyId: string | undefined,
  timeoutMs: number,
): Promise<Credentials | null> =>
  new Promise((resolve) => {
    const read = () => {
      const credentials = liveCredentials(connectionId)();
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
 * Keeps STS credentials and the Keycloak session alive. Also installs the
 * `credentialsRefresh` refresher so the ExpiredToken retry path in
 * `signedFetch` / `listObjectsClient` can re-mint credentials.
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

    const uninstall = setCredentialsRefresher(async (connectionId) => {
      const previousKeyId = liveCredentials(connectionId)()?.AccessKeyId;

      await revalidateOnce();

      const rotated = await waitForRotatedCredentials(
        connectionId,
        previousKeyId,
        STORE_UPDATE_TIMEOUT_MS,
      );
      if (rotated) return rotated;

      // No rotation observed — return what the store holds; the caller's
      // retry surfaces the error if it is still stale.
      const current = liveCredentials(connectionId)();
      if (!current) {
        throw new Error(`No credentials for connection "${connectionId}" after refresh.`);
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
