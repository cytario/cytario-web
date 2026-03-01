import { Sha256 } from "@aws-crypto/sha256-browser";
import type { Credentials } from "@aws-sdk/client-sts";
import { SignatureV4 } from "@smithy/signature-v4";

import { BucketConfig } from "~/.generated/client";

/**
 * A zarr-compatible HTTP store that signs requests with AWS Signature V4.
 * This allows accessing S3-stored zarr files using STS temporary credentials.
 *
 * Implements zarrita's AsyncReadable interface for use with loadOmeZarrFromStore.
 */
export class CredentialedHTTPStore {
  private signer: SignatureV4;
  private baseUrl: URL;
  private region: string;

  constructor(
    url: string,
    credentials: Credentials,
    bucketConfig?: BucketConfig,
  ) {
    // Ensure URL ends with /
    this.baseUrl = new URL(url.endsWith("/") ? url : url + "/");
    this.region = bucketConfig?.region ?? "us-east-1";

    if (!credentials.AccessKeyId || !credentials.SecretAccessKey) {
      throw new Error(
        "Invalid credentials: AccessKeyId and SecretAccessKey are required",
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
   * Zarrita AsyncReadable interface: fetch a key from the store with signed request.
   * Returns undefined for missing keys (404).
   */
  async get(key: string): Promise<Uint8Array | undefined> {
    const url = new URL(key.replace(/^\//, ""), this.baseUrl);

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

    if (response.status === 404) {
      return undefined;
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(`HTTP ${response.status} fetching ${key}: ${errorText}`);
    }

    return new Uint8Array(await response.arrayBuffer());
  }

}
