import { Sha256 } from "@aws-crypto/sha256-browser";
import type { Credentials } from "@aws-sdk/client-sts";
import { SignatureV4 } from "@smithy/signature-v4";

import type { ConnectionConfig } from "~/.generated/client";

export type SignedFetch = (
  url: string,
  init?: RequestInit,
) => Promise<Response>;

/**
 * Create a fetch function that signs every request with AWS Signature V4.
 * Credentials are resolved lazily via a getter — the signer is recreated
 * automatically when the AccessKeyId changes (credential rotation).
 */
export function createSignedFetch(
  getCredentials: () => Credentials,
  connectionConfig: Pick<ConnectionConfig, "region">,
): SignedFetch {
  let cachedKeyId: string | undefined;
  let signer: SignatureV4;

  return async (url: string, init?: RequestInit): Promise<Response> => {
    const credentials = getCredentials();

    if (!credentials.AccessKeyId || !credentials.SecretAccessKey) {
      throw new Error(
        "Invalid credentials: AccessKeyId and SecretAccessKey are required",
      );
    }

    // Recreate signer only when credentials rotate
    if (credentials.AccessKeyId !== cachedKeyId) {
      signer = new SignatureV4({
        credentials: {
          accessKeyId: credentials.AccessKeyId,
          secretAccessKey: credentials.SecretAccessKey,
          sessionToken: credentials.SessionToken,
        },
        region: connectionConfig.region || "eu-central-1",
        service: "s3",
        sha256: Sha256,
      });
      cachedKeyId = credentials.AccessKeyId;
    }

    const parsed = new URL(url);

    // Decode the pathname so the signer can re-encode it in canonical form.
    // Without this, percent-encoded characters (e.g. %20 for spaces) get
    // double-encoded in the canonical request, causing a signature mismatch.
    const decodedPath = decodeURIComponent(parsed.pathname);

    // Only sign the host header — additional headers like Range are passed
    // through unsigned to avoid CORS/signature mismatch issues.
    const callerHeaders = (init?.headers as Record<string, string>) ?? {};

    const request = {
      method: (init?.method as string) ?? "GET",
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port ? parseInt(parsed.port) : undefined,
      path: decodedPath + parsed.search,
      headers: {
        host: parsed.host,
      },
    };

    const signed = await signer.sign(request);

    return fetch(url, {
      ...init,
      method: request.method,
      headers: {
        ...(signed.headers as Record<string, string>),
        ...callerHeaders,
      },
      signal: init?.signal,
    });
  };
}
