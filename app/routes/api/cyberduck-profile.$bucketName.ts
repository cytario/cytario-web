import { ActionFunctionArgs } from "react-router";

import { authContext, authMiddleware } from "~/.server/auth/authMiddleware";
import { requestDurationMiddleware } from "~/.server/requestDurationMiddleware";
import { cytarioConfig } from "~/config";
import { getBucketConfigByName } from "~/utils/bucketConfig";
import { getS3ProviderConfig } from "~/utils/s3Provider";

export const middleware = [requestDurationMiddleware, authMiddleware];

export const loader = async ({ params, context }: ActionFunctionArgs) => {
  const { user } = context.get(authContext);
  const { sub: userId } = user;

  const { provider, bucketName } = params;

  if (!provider) {
    return new Response("Provider is required", { status: 400 });
  }

  if (!bucketName) {
    return new Response("Bucket name is required", { status: 400 });
  }

  const bucketConfig = await getBucketConfigByName(userId, provider, bucketName);

  if (!bucketConfig) {
    return new Response("Bucket configuration not found", { status: 404 });
  }

  const { auth, endpoints } = cytarioConfig;

  const actualRegion = bucketConfig.region ?? "eu-central-1";
  const providerConfig = getS3ProviderConfig(bucketConfig.endpoint, actualRegion);

  // Derive a unique vendor ID from the webapp hostname (e.g. "cytario.com" → "cytario-com")
  const vendor = new URL(endpoints.webapp).hostname.replace(/\./g, "-");

  // Generate Cyberduck profile XML
  const profile = generateCyberduckProfile({
    vendor,
    bucketName,
    roleArn: bucketConfig.roleArn,
    region: actualRegion,
    endpoint: providerConfig.s3Endpoint,
    stsEndpoint: providerConfig.stsEndpoint,
    isAWS: providerConfig.isAwsS3,
    oauthConfig: {
      authUrl: `${auth.baseUrl}/protocol/openid-connect/auth`,
      tokenUrl: `${auth.baseUrl}/protocol/openid-connect/token`,
      clientId: auth.cyberduckClientId,
      scopes: auth.scopes,
      redirectUrl: "x-cyberduck-action:oauth",
    },
  });

  // Return XML as downloadable file
  return new Response(profile, {
    headers: {
      "Content-Type": "application/xml",
      "Content-Disposition": `attachment; filename="${bucketName}.cyberduckprofile"`,
    },
  });
};

interface CyberduckProfileConfig {
  vendor: string;
  bucketName: string;
  roleArn: string | null;
  region: string;
  endpoint: string;
  stsEndpoint: string;
  isAWS: boolean;
  oauthConfig: {
    authUrl: string;
    tokenUrl: string;
    clientId: string;
    scopes: string[];
    redirectUrl: string;
  };
}

function generateCyberduckProfile(config: CyberduckProfileConfig): string {
  const {
    vendor,
    bucketName,
    roleArn,
    region,
    endpoint,
    stsEndpoint,
    isAWS,
    oauthConfig,
  } = config;

  // Build scopes array
  const scopesXml = oauthConfig.scopes
    .map((scope) => `        <string>${escapeXml(scope)}</string>`)
    .join("\n");

  // Build S3 properties
  const s3Properties: string[] = [];

  // Only disable virtual host style for non-AWS endpoints (MinIO, etc.)
  // AWS S3 uses virtual host style by default and works better with it
  if (!isAWS) {
    s3Properties.push(`        <key>s3.bucket.virtualhost.disable</key>
        <true/>`);
  }

  // Set region
  s3Properties.push(`        <key>s3.location</key>
        <string>${escapeXml(region)}</string>`);

  // Set custom endpoint hostname (strip protocol)
  const hostnameWithoutProtocol = endpoint.replace(/^https?:\/\//, "");
  s3Properties.push(`        <key>s3.hostname.default</key>
        <string>${escapeXml(hostnameWithoutProtocol)}</string>`);

  const s3PropertiesXml = s3Properties.join("\n") + "\n";

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
    <dict>
        <key>Protocol</key>
        <string>s3</string>
        <key>Vendor</key>
        <string>${escapeXml(vendor)}</string>
        <key>Description</key>
        <string>Cytario - ${escapeXml(bucketName)}</string>
        <key>Default Nickname</key>
        <string>${escapeXml(bucketName)}</string>
        <key>Default Path</key>
        <string>/${escapeXml(bucketName)}/</string>
        <key>OAuth Authorization Url</key>
        <string>${escapeXml(oauthConfig.authUrl)}</string>
        <key>OAuth Token Url</key>
        <string>${escapeXml(oauthConfig.tokenUrl)}</string>
        <key>OAuth Client ID</key>
        <string>${escapeXml(oauthConfig.clientId)}</string>
        <key>OAuth Client Secret</key>
        <string></string>
        <key>OAuth PKCE</key>
        <true/>
        <key>OAuth Redirect Url</key>
        <string>${escapeXml(oauthConfig.redirectUrl)}</string>
        <key>Scopes</key>
        <array>
${scopesXml}
        </array>
        <key>Authorization</key>
        <string>AuthorizationCode</string>
        <key>Password Configurable</key>
        <false/>
        <key>Username Configurable</key>
        <false/>
        <key>Token Configurable</key>
        <false/>
        <key>Username Placeholder</key>
        <string>Username</string>
        <key>STS Endpoint</key>
        <string>${escapeXml(stsEndpoint)}</string>
        <key>Properties</key>
        <dict>${roleArn ? `
            <key>s3.assumerole.rolearn</key>
            <string>${escapeXml(roleArn)}</string>` : ""}
${s3PropertiesXml}        </dict>
    </dict>
</plist>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
