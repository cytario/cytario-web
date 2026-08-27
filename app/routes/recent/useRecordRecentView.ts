import { useEffect } from "react";
import { useFetcher } from "react-router";

/**
 * Records a "recently viewed" entry via a fire-and-forget POST to `/recent`.
 * Fires once per `resourceId` change; connection-root views (empty pathName) are skipped.
 */
export function useRecordRecentView(
  resourceId: string,
  data: {
    connectionId: string;
    pathName: string;
    name: string;
    isSingleFile?: boolean;
  },
) {
  const fetcher = useFetcher();

  useEffect(() => {
    if (!data.pathName) return;
    fetcher.submit(
      {
        connectionId: data.connectionId,
        pathName: data.pathName,
        name: data.name,
        type: data.isSingleFile ? "file" : "directory",
      },
      { method: "post", action: "/recent" },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resourceId]);
}
