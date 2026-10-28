import { ActionFunctionArgs } from "react-router";

import { authContext, authMiddleware } from "~/.server/auth/authMiddleware";
import { pickGrantForUser } from "~/.server/auth/getSessionCredentials";
import { getBucketCatalog } from "~/.server/providers/bucketCatalog.server";
import {
  getProviderCatalog,
  resolveConnectionProviderWithGrants,
} from "~/.server/providers/providerCatalog.server";
import { requestDurationMiddleware } from "~/.server/requestDurationMiddleware";
import { cytarioConfig } from "~/config";
import { getConnection } from "~/routes/connections/connections.server";
import { getS3ProviderConfig } from "~/utils/s3Provider";

export const middleware = [requestDurationMiddleware, authMiddleware];

export const loader = async ({ params, context }: ActionFunctionArgs) => {
  const { user } = context.get(authContext);
  const { id: connectionId } = params;

  if (!connectionId) {
    return new Response("Connection id is required", { status: 400 });
  }

  const connectionConfig = await getConnection(user, connectionId);
  if (!connectionConfig) {
    return new Response("Connection configuration not found", { status: 404 });
  }

  const { bucketName, prefix, name: connectionName } = connectionConfig;
  const { auth, endpoints } = cytarioConfig;

  // The concrete role/endpoint/region live on the referenced provider
  // connection and the grant-level storage roles resolved from the org
  // catalog, not on the connection. The embedded role is the downloading
  // user's most permissive applicable grant.
  let resolvedConnectionProvider;
  try {
    const catalog = await getProviderCatalog(connectionConfig.organization);
    const bucketCatalog = await getBucketCatalog(connectionConfig.organization).catch(
      () => undefined,
    );
    const resolved = resolveConnectionProviderWithGrants(catalog, connectionConfig, bucketCatalog);
    if (!resolved) {
      return new Response("Provider connection or role is unavailable for this connection", {
        status: 502,
      });
    }
    const grant = pickGrantForUser(resolved, user, connectionConfig.organization);
    if (!grant) {
      return new Response("You are not a member of any group granted access to this connection.", {
        status: 403,
      });
    }
    resolvedConnectionProvider = {
      region: resolved.region,
      endpoint: resolved.endpoint,
      roleArn: grant.roleArn,
      isPublic: resolved.isPublic,
    };
  } catch {
    return new Response("Provider connection or role is unavailable for this connection", {
      status: 502,
    });
  }
  const connectionProvider = resolvedConnectionProvider;

  const actualRegion = connectionProvider.region;
  const providerConfig = getS3ProviderConfig(connectionProvider.endpoint, actualRegion);

  const vendor = new URL(endpoints.webapp).hostname.replace(/\./g, "-");

  const sharedConfig = {
    vendor,
    connectionName,
    bucketName,
    prefix: prefix?.replace(/\/$/, "") || "",
    region: actualRegion,
    endpoint: providerConfig.s3Endpoint,
    isAWS: providerConfig.isAwsS3,
  };

  const profile = connectionProvider.isPublic
    ? generateCyberduckProfile({ ...sharedConfig, mode: "anonymous" })
    : generateCyberduckProfile({
        ...sharedConfig,
        mode: "oidc",
        roleArn: connectionProvider.roleArn,
        stsEndpoint: providerConfig.stsEndpoint,
        oauthConfig: {
          authUrl: `${auth.baseUrl}/protocol/openid-connect/auth`,
          tokenUrl: `${auth.baseUrl}/protocol/openid-connect/token`,
          clientId: auth.cyberduckClientId,
          scopes: auth.scopes,
          redirectUrl: "x-cyberduck-action:oauth",
        },
      });

  return new Response(profile, {
    headers: {
      "Content-Type": "application/xml",
      "Content-Disposition": `attachment; filename="${connectionName.replace(/["\r\n\\]/g, "_")}.cyberduckprofile"`,
    },
  });
};

interface CyberduckProfileConfigBase {
  vendor: string;
  connectionName: string;
  bucketName: string;
  prefix: string;
  region: string;
  endpoint: string;
  isAWS: boolean;
}

interface OidcProfileConfig extends CyberduckProfileConfigBase {
  mode: "oidc";
  roleArn: string | null;
  stsEndpoint: string;
  oauthConfig: {
    authUrl: string;
    tokenUrl: string;
    clientId: string;
    scopes: string[];
    redirectUrl: string;
  };
}

interface AnonymousProfileConfig extends CyberduckProfileConfigBase {
  mode: "anonymous";
}

type CyberduckProfileConfig = OidcProfileConfig | AnonymousProfileConfig;

function generateCyberduckProfile(config: CyberduckProfileConfig): string {
  const { vendor, connectionName, bucketName, prefix, region, endpoint, isAWS, mode } = config;

  const s3Properties: string[] = [];

  // Virtual-host style breaks non-AWS endpoints (MinIO, etc.); AWS S3 works
  // better with it enabled.
  if (!isAWS) {
    s3Properties.push(`        <key>s3.bucket.virtualhost.disable</key>
        <true/>`);
  }

  s3Properties.push(`        <key>s3.location</key>
        <string>${escapeXml(region)}</string>`);

  const hostnameWithoutProtocol = endpoint.replace(/^https?:\/\//, "");
  s3Properties.push(`        <key>s3.hostname.default</key>
        <string>${escapeXml(hostnameWithoutProtocol)}</string>`);

  const s3PropertiesXml = s3Properties.join("\n") + "\n";

  const authSectionXml =
    mode === "anonymous"
      ? `        <key>Anonymous Configurable</key>
        <true/>`
      : oidcSectionXml(config.oauthConfig, config.stsEndpoint);

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
    <dict>
        <key>Protocol</key>
        <string>s3</string>
        <key>Vendor</key>
        <string>${escapeXml(vendor)}</string>
        <key>Description</key>
        <string>Cytario - ${escapeXml(connectionName)}</string>
        <key>Default Nickname</key>
        <string>${escapeXml(connectionName)}</string>
        <key>Default Path</key>
        <string>/${escapeXml(bucketName)}${prefix ? `/${escapeXml(prefix)}` : ""}/</string>
${authSectionXml}
        <key>Properties</key>
        <dict>${
          config.mode === "oidc" && config.roleArn
            ? `
            <key>s3.assumerole.rolearn</key>
            <string>${escapeXml(config.roleArn)}</string>`
            : ""
        }
${s3PropertiesXml}        </dict>
    </dict>
</plist>`;
}

function oidcSectionXml(
  oauthConfig: OidcProfileConfig["oauthConfig"],
  stsEndpoint: string,
): string {
  const scopesXml = oauthConfig.scopes
    .map((scope) => `        <string>${escapeXml(scope)}</string>`)
    .join("\n");

  return `        <key>OAuth Authorization Url</key>
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
        <string>${escapeXml(stsEndpoint)}</string>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
