import { Button } from "@cytario/design";
import { LoaderCircle, RefreshCw } from "lucide-react";
import { useEffect } from "react";
import { useFetcher } from "react-router";

import type { ConnectionIndexLoaderData } from "./connectionIndex.loader";

interface IndexStatusProps {
  connectionName: string;
}

/**
 * Self-contained status chip for a connection's parquet index.
 *
 * Loads current status via `useFetcher` against `/connectionIndex/:name` and
 * submits rebuilds against the same route's action. Not currently rendered in
 * production — retained for the upcoming `StatusDot` redesign that folds
 * indexing into the broader connection status surface.
 */
export function IndexStatus({ connectionName }: IndexStatusProps) {
  const statusFetcher = useFetcher<ConnectionIndexLoaderData>();
  const rebuildFetcher = useFetcher();

  const url = `/connectionIndex/${encodeURIComponent(connectionName)}`;

  useEffect(() => {
    statusFetcher.load(url);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load is stable; re-fire only on URL change
  }, [url]);

  // Re-fetch status whenever a rebuild completes so the chip reflects the new
  // objectCount/builtAt without a page reload.
  useEffect(() => {
    if (rebuildFetcher.state === "idle" && rebuildFetcher.data) {
      statusFetcher.load(url);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rebuildFetcher.state, rebuildFetcher.data]);

  const handleRebuild = () => {
    rebuildFetcher.submit(null, { method: "POST", action: url });
  };

  const isRebuilding = rebuildFetcher.state !== "idle";
  const isLoadingStatus =
    statusFetcher.state !== "idle" && !statusFetcher.data;

  return (
    <div className="flex items-center gap-2 text-sm text-slate-500">
      {isLoadingStatus && <span>Loading index…</span>}
      {!isLoadingStatus && statusFetcher.data?.exists === true && (
        <span>
          {statusFetcher.data.objectCount.toLocaleString()} indexed
        </span>
      )}
      {!isLoadingStatus && statusFetcher.data?.exists === false && (
        <span>No index</span>
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
        {isRebuilding ? "Indexing…" : "Index"}
      </Button>
    </div>
  );
}
