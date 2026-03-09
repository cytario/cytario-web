import { Button } from "@cytario/design";
import { LoaderCircle, RefreshCw } from "lucide-react";
import { useEffect } from "react";
import { useFetcher } from "react-router";

import { probeIndex } from "~/utils/connectionIndex";
import {
  selectConnectionIndex,
  useConnectionsStore,
} from "~/utils/connectionsStore";

interface IndexStatusProps {
  alias: string;
}

export function IndexStatus({ alias }: IndexStatusProps) {
  const bucketIndex = useConnectionsStore(selectConnectionIndex(alias));
  const setConnectionIndex = useConnectionsStore((s) => s.setConnectionIndex);

  const fetcher = useFetcher();

  useEffect(() => {
    probeIndex(alias);
  }, [alias]);

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      const data = fetcher.data as { objectCount: number; builtAt: string };
      setConnectionIndex(alias, {
        status: "ready",
        objectCount: data.objectCount,
        builtAt: data.builtAt,
      });
    }
  }, [fetcher.state, fetcher.data, alias, setConnectionIndex]);

  const handleRebuild = () => {
    fetcher.submit(null, {
      method: "POST",
      action: `/api/reindex/${alias}`,
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
        size="sm"
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
