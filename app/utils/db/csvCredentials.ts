import type { Credentials } from "@aws-sdk/client-sts";

import { escapeSqlString } from "./escapeSqlString";

type Queryable = { query: (sql: string) => Promise<unknown> };

/**
 * Whole-file CSV→Parquet conversion holds the CSV in the JS heap and a copy in
 * the DuckDB worker heap (~2× file size peak). Mirrors the 256 MB download
 * ceiling: beyond this, refuse rather than risk the renderer OOM kill.
 */
export const CSV_CONVERSION_MAX_BYTES = 256 * 1024 * 1024;

/** Single-quote-escape every interpolated value — non-AWS providers may carry `'`. */
export const applyS3Credentials = async (connection: Queryable, credentials: Credentials) => {
  const { AccessKeyId, SecretAccessKey, SessionToken } = credentials;
  await connection.query(`SET s3_access_key_id='${escapeSqlString(AccessKeyId ?? "")}'`);
  await connection.query(`SET s3_secret_access_key='${escapeSqlString(SecretAccessKey ?? "")}'`);
  await connection.query(`SET s3_session_token='${escapeSqlString(SessionToken ?? "")}'`);
};
