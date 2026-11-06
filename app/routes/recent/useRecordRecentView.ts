import { useEffect } from "react";
import { useFetcher } from "react-router";

import { useOrgPath } from "~/hooks/useOrgPath";

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
  const recentPath = useOrgPath()("/recent");

  useEffect(() => {
    if (!data.pathName) return;
    fetcher.submit(
      {
        connectionId: data.connectionId,
        pathName: data.pathName,
        name: data.name,
        type: data.isSingleFile ? "file" : "directory",
      },
      { method: "post", action: recentPath },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resourceId]);
}
