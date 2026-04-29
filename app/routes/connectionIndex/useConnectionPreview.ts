import { useEffect, useState } from "react";

import { connectionIndexRead } from "./connectionIndexRead";
import { select } from "~/utils/connectionsStore/selectors";
import { useConnectionsStore } from "~/utils/connectionsStore/useConnectionsStore";
import { isImageFile } from "~/utils/fileType";

/**
 * Returns the first image-like key from a connection's parquet index, or
 * `null` if the connection has no index, no images, or hasn't loaded yet.
 * Used by bucket cards to render a thumbnail preview.
 *
 * Cheap: SELECT … LIMIT 1 against the cached index parquet.
 */
export function useConnectionPreview(connectionName: string): string | null {
  const connection = useConnectionsStore(select.connection(connectionName));
  const [previewKey, setPreviewKey] = useState<string | null>(null);

  useEffect(() => {
    if (!connection) return;

    let cancelled = false;
    connectionIndexRead({
      connection,
      prefix: "",
      limit: 5000,
    })
      .then((rows) => {
        if (cancelled) return;
        const first = rows.find((row) => row.Key && isImageFile(row.Key));
        setPreviewKey(first?.Key ?? null);
      })
      .catch(() => {
        // Index missing or read failure — no preview, no error UI.
        if (!cancelled) setPreviewKey(null);
      });

    return () => {
      cancelled = true;
    };
  }, [connection]);

  return previewKey;
}
