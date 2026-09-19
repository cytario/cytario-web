import { getS3ProviderConfig } from "~/utils/s3Provider";

// Raw STS response for callers that need the key material (the broker's
// response body); callers returning a signed surface to the plugin must not
// leak these.
export interface WebIdentityCredentials {
  AccessKeyId: string;
  SecretAccessKey: string;
  SessionToken?: string;
  Expiration?: Date;
}

/** Mints short-lived credentials via `AssumeRoleWithWebIdentity`; throws when STS returns no usable keys. */
export async function assumeRoleWithWebIdentity(input: {
  roleArn: string;
  roleSessionName: string;
  webIdentityToken: string;
  region: string;
  endpoint?: string | null;
  policy?: string;
}): Promise<WebIdentityCredentials> {
  const providerConfig = getS3ProviderConfig(input.endpoint, input.region);
  const { STSClient, AssumeRoleWithWebIdentityCommand } = await import("@aws-sdk/client-sts");
  const stsClient = new STSClient({
    endpoint: providerConfig.stsEndpoint,
    region: input.region,
  });

  const { Credentials } = await stsClient.send(
    new AssumeRoleWithWebIdentityCommand({
      RoleArn: input.roleArn,
      RoleSessionName: input.roleSessionName,
      WebIdentityToken: input.webIdentityToken,
      DurationSeconds: 3600,
      ...(input.policy ? { Policy: input.policy } : {}),
    }),
  );

  if (!Credentials?.AccessKeyId || !Credentials?.SecretAccessKey) {
    throw new Error("STS returned no credentials");
  }

  return {
    AccessKeyId: Credentials.AccessKeyId,
    SecretAccessKey: Credentials.SecretAccessKey,
    SessionToken: Credentials.SessionToken,
    Expiration: Credentials.Expiration,
  };
}

/** Sanitizes into a valid STS `RoleSessionName` (≤64 chars, `[\w+=,.@-]`), collapsing consecutive hyphens; falls back to `cytario-session`. */
export function sanitizeRoleSessionName(name: string): string {
  const sanitized = name
    .replace(/[^\w+=,.@-]/g, "-")
    .replace(/-{2,}/g, "-")
    .slice(0, 64);

  return sanitized.length >= 2 ? sanitized : "cytario-session";
}
