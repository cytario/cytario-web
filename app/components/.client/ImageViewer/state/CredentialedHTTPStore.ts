import { Sha256 } from "@aws-crypto/sha256-browser";
import type { Credentials } from "@aws-sdk/client-sts";
import { SignatureV4 } from "@smithy/signature-v4";

import type { ClientBucketConfig } from "~/utils/credentialsStore/useCredentialsStore";

/**
 * A zarr-compatible HTTP store that signs requests with AWS Signature V4.
 * This allows accessing S3-stored zarr files using STS temporary credentials.
 *
 * Implements the zarr AsyncStore interface for read-only access.
 */
export class CredentialedHTTPStore {
  private signer: SignatureV4;
  private baseUrl: URL;
  private region: string;

  constructor(
    url: string,
    credentials: Credentials,
    bucketConfig?: ClientBucketConfig
  ) {
    // Ensure URL ends with /
    this.baseUrl = new URL(url.endsWith("/") ? url : url + "/");
    this.region = bucketConfig?.region ?? "us-east-1";

    if (!credentials.AccessKeyId || !credentials.SecretAccessKey) {
      throw new Error(
        "Invalid credentials: AccessKeyId and SecretAccessKey are required"
      );
    }

    this.signer = new SignatureV4({
      credentials: {
        accessKeyId: credentials.AccessKeyId,
        secretAccessKey: credentials.SecretAccessKey,
        sessionToken: credentials.SessionToken,
      },
      region: this.region,
      service: "s3",
      sha256: Sha256,
    });
  }

  /**
   * Fetch a key from the store with signed request.
   */
  async getItem(key: string): Promise<ArrayBuffer> {
    const url = new URL(key, this.baseUrl);

    const request = {
      method: "GET" as const,
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port ? parseInt(url.port) : undefined,
      path: url.pathname,
      headers: {
        host: url.host,
      },
    };

    const signedRequest = await this.signer.sign(request);

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: signedRequest.headers as HeadersInit,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(`HTTP ${response.status} fetching ${key}: ${errorText}`);
    }

    return response.arrayBuffer();
  }

  /**
   * Check if a key exists in the store.
   */
  async containsItem(key: string): Promise<boolean> {
    try {
      const url = new URL(key, this.baseUrl);

      const request = {
        method: "HEAD" as const,
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port ? parseInt(url.port) : undefined,
        path: url.pathname,
        headers: {
          host: url.host,
        },
      };

      const signedRequest = await this.signer.sign(request);

      const response = await fetch(url.toString(), {
        method: "HEAD",
        headers: signedRequest.headers as HeadersInit,
      });

      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * List keys in the store (not implemented for S3).
   */
  async keys(): Promise<string[]> {
    return [];
  }

  /**
   * Delete an item (not supported - read-only store).
   */
  async deleteItem(): Promise<boolean> {
    return false;
  }

  /**
   * Set an item (not supported - read-only store).
   */
  async setItem(): Promise<boolean> {
    console.warn("CredentialedHTTPStore is read-only");
    return false;
  }
}
