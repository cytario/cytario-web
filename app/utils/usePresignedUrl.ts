import { useEffect, useState } from "react";

import { parseResourceId } from "./resourceId";

interface UsePresignedUrlResult {
  url: string | null;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Cache for presigned URLs to avoid refetching within the same session.
 * URLs expire after ~1 hour, but navigation happens much faster.
 */
const urlCache = new Map<string, string>();

/**
 * Hook to lazily fetch a presigned URL for a resourceId.
 * Uses caching to avoid redundant fetches.
 *
 * @param resourceId - S3 resource identifier (provider/bucketName/pathName)
 */
export function usePresignedUrl(resourceId: string): UsePresignedUrlResult {
  const [url, setUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(!!resourceId);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // Check cache first
    const cached = urlCache.get(resourceId);
    if (cached) {
      setUrl(cached);
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchUrl() {
      try {
        // const { provider, bucketName, pathName } = parseResourceId(resourceId);
        const response = await fetch(`/presign/${resourceId}`);

        if (!response.ok) {
          throw new Error(
            `Failed to get presigned URL: ${response.statusText}`
          );
        }

        const data = await response.json();

        if (!cancelled) {
          urlCache.set(resourceId, data.url);
          setUrl(data.url);
          setIsLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)));
          setIsLoading(false);
        }
      }
    }

    fetchUrl();

    return () => {
      cancelled = true;
    };
  }, [resourceId]);

  return { url, isLoading, error };
}
