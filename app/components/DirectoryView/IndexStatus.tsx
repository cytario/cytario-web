import { Button } from "@cytario/design";
import { LoaderCircle, RefreshCw } from "lucide-react";
import { useEffect } from "react";
import { useFetcher } from "react-router";
import { z } from "zod";

import { probeIndex } from "~/utils/connectionIndex";
import {
  selectConnectionIndex,
  useConnectionsStore,
} from "~/utils/connectionsStore";

const reindexResponseSchema = z.object({
  objectCount: z.number(),
  builtAt: z.string(),
});

interface IndexStatusProps {
  connectionName: string;
}

export function IndexStatus({ connectionName }: IndexStatusProps) {
  const bucketIndex = useConnectionsStore(selectConnectionIndex(connectionName));
  const setConnectionIndex = useConnectionsStore((s) => s.setConnectionIndex);

  const fetcher = useFetcher();

  useEffect(() => {
    probeIndex(connectionName);
  }, [connectionName]);

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      const parsed = reindexResponseSchema.safeParse(fetcher.data);
      if (parsed.success) {
        setConnectionIndex(connectionName, {
          status: "ready",
          objectCount: parsed.data.objectCount,
          builtAt: parsed.data.builtAt,
        });
      } else {
        setConnectionIndex(connectionName, {
          status: "error",
          objectCount: 0,
          builtAt: null,
        });
      }
    }
  }, [fetcher.state, fetcher.data, connectionName, setConnectionIndex]);

  const handleRebuild = () => {
    fetcher.submit(null, {
      method: "POST",
      action: `/api/reindex/${connectionName}`,
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

      <Button
        onPress={handleRebuild}
        isDisabled={isRebuilding}
        variant="secondary"
      >
        {isRebuilding ? (
          <LoaderCircle size={14} className="animate-spin" />
        ) : (
          <RefreshCw size={14} />
        )}
        {isRebuilding ? "Indexing..." : "Index"}
      </Button>
    </div>
  );
}
