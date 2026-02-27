import { useEffect } from "react";
import { useFetcher } from "react-router";

import { Button, Icon } from "~/components/Controls";
import { probeIndex } from "~/utils/connectionIndex";
import {
  selectConnectionIndex,
  useConnectionsStore,
} from "~/utils/connectionsStore";
import { createConnectionKey } from "~/utils/resourceId";

interface IndexStatusProps {
  provider: string;
  bucketName: string;
  prefix: string;
}

export function IndexStatus({ provider, bucketName, prefix }: IndexStatusProps) {
  const connKey = createConnectionKey(provider, bucketName, prefix);

  const bucketIndex = useConnectionsStore(selectConnectionIndex(connKey));
  const setConnectionIndex = useConnectionsStore((s) => s.setConnectionIndex);

  const fetcher = useFetcher();

  // Probe index on mount
  useEffect(() => {
    probeIndex(connKey, provider, bucketName, prefix);
  }, [connKey, provider, bucketName, prefix]);

  // Update store when rebuild completes
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      const data = fetcher.data as { objectCount: number; builtAt: string };
      setConnectionIndex(connKey, {
        status: "ready",
        objectCount: data.objectCount,
        builtAt: data.builtAt,
      });
    }
  }, [fetcher.state, fetcher.data, connKey, setConnectionIndex]);

  const handleRebuild = () => {
    const formData = new FormData();
    formData.set("prefix", prefix);

    fetcher.submit(formData, {
      method: "POST",
      action: `/api/reindex/${provider}/${bucketName}`,
    });
  };

  const isRebuilding = fetcher.state !== "idle";

  return (
    <div className="flex items-center gap-2 text-sm text-slate-500">
      {bucketIndex?.status === "ready" && (
        <span>{bucketIndex.objectCount.toLocaleString()} indexed</span>
      )}
      {bucketIndex?.status === "missing" && <span>No index</span>}
      {bucketIndex?.status === "loading" && <span>Loading index...</span>}
      {bucketIndex?.status === "error" && (
        <span className="text-rose-500">Index error</span>
      )}

      <Button onClick={handleRebuild} disabled={isRebuilding} theme="white">
        <Icon
          icon={isRebuilding ? "LoaderCircle" : "RefreshCw"}
          size={14}
          className={isRebuilding ? "animate-spin" : undefined}
        />
        {isRebuilding ? "Indexing..." : "Index"}
      </Button>
    </div>
  );
}
