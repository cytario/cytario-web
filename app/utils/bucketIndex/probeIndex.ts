import { Credentials } from "@aws-sdk/client-sts";

import { BucketConfig } from "~/.generated/client";
import { useConnectionsStore } from "~/utils/connectionsStore";
import { createDatabase } from "~/utils/db/createDatabase";
import { toIndexS3Key } from "~/utils/resourceId";

/**
 * Probes whether a bucket index Parquet file exists in S3.
 * If found, stores the DuckDB WASM connection for subsequent queries.
 * Does NOT trigger a rebuild — that's a separate user action.
 */
export async function probeIndex(
  connectionKey: string,
  bucketName: string,
  prefix: string,
  credentials: Credentials,
  bucketConfig: BucketConfig,
): Promise<void> {
  const state = useConnectionsStore.getState();
  const current = state.connections[connectionKey]?.bucketIndex;

  if (current && (current.status === "ready" || current.status === "loading")) {
    return;
  }

  state.setBucketIndex(connectionKey, {
    status: "loading",
    objectCount: 0,
    builtAt: null,
  });

  try {
    const connection = await createDatabase(
      connectionKey,
      credentials,
      bucketConfig,
    );

    const s3Uri = `s3://${bucketName}/${toIndexS3Key(prefix)}`;
    const result = await connection.query(
      `SELECT COUNT(*) as count FROM read_parquet('${s3Uri}')`,
    );

    const row = result.get(0);
    const count = row ? Number(row.count) : 0;

    useConnectionsStore.getState().setBucketIndex(connectionKey, {
      status: "ready",
      objectCount: count,
      builtAt: null,
    });
  } catch {
    useConnectionsStore.getState().setBucketIndex(connectionKey, {
      status: "missing",
      objectCount: 0,
      builtAt: null,
    });
  }
}
