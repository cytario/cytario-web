import { getS3ProviderConfig } from "~/utils/s3Provider";

/**
 * The credentials minted by `assumeRoleWithWebIdentity` — the raw STS
 * response for callers that need the key material (the broker's response
 * body). Callers that return a signed surface to the plugin must not leak
 * these; they assemble their own output from the returned Credentials.
 */
export interface WebIdentityCredentials {
  AccessKeyId: string;
  SecretAccessKey: string;
  SessionToken?: string;
  Expiration?: Date;
}

/**
 * Mints short-lived credentials via `AssumeRoleWithWebIdentity`. Resolves the
 * STS endpoint from the storage endpoint/region, presents `webIdentityToken`
 * as the OIDC token, and attaches `policy` (an inline session-policy filter)
 * when supplied. Throws when STS returns no usable keys.
 */
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

/**
 * Sanitizes a string into a valid STS `RoleSessionName` (≤64 chars, `[\w+=,.@-]`).
 * Collapses consecutive hyphens and falls back to `cytario-session` for names
 * too short to be valid — shared by every STS mint in the server.
 */
export function sanitizeRoleSessionName(name: string): string {
  const sanitized = name
    .replace(/[^\w+=,.@-]/g, "-")
    .replace(/-{2,}/g, "-")
    .slice(0, 64);

  return sanitized.length >= 2 ? sanitized : "cytario-session";
}
