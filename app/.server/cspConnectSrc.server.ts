import { getSession, getSessionData } from "./auth/getSession";
import type { UserProfile } from "./auth/getUserInfo";
import { getOrExchangeOrgAccessToken } from "./auth/orgTokenExchange";
import { createLabel } from "./logging";
import { getBucketCatalog } from "./providers/bucketCatalog.server";
import {
  getProviderCatalog,
  resolveConnectionProviderWithGrants,
} from "./providers/providerCatalog.server";
import { cytarioConfig } from "~/config";
import { listConnections } from "~/routes/connections/connections.server";

const label = createLabel("csp", "magenta");

/** Derive the CSP connect-src host set for one HTML response from the
 * organization active in the request's session. Fail-closed: no session, no
 * active organization, or an unresolvable catalog yields an empty set. */
export async function resolveConnectSrcHosts(request: Request): Promise<string[]> {
  let organization: string | undefined;
  let subjectToken: string | undefined;
  let sessionId: string | undefined;
  let user: UserProfile | undefined;
  try {
    const cookie = request.headers.get("cookie");
    if (!cookie) return [];
    const session = await getSession(request);
    const sessionData = await getSessionData(session);
    user = sessionData.user;
    organization = sessionData.user?.organization;
    subjectToken = sessionData.authTokens?.accessToken;
    sessionId = session.id;
  } catch (error) {
    console.warn(`${label} session read failed, CSP connect-src fails closed:`, error);
    return [];
  }

  if (!user || !organization || !subjectToken) return [];

  try {
    // Portal lookups present a narrow per-org access token: the portal rejects
    // the multi-membership session token a multi-org user carries. The CSP
    // derivation is best-effort — an exchange failure degrades to a closed
    // host set rather than failing the response.
    const accessToken = await getOrExchangeOrgAccessToken(sessionId!, organization, subjectToken)
      .then((exchanged) => exchanged.accessToken)
      .catch(() => undefined);
    const catalog = await getProviderCatalog(organization, accessToken);
    const hosts = new Set<string>();

    // Catalog endpoints cover not-yet-connected providers; the bucket and row
    // passes below cover per-bucket and per-connection regions and endpoint
    // overrides the provider rows cannot see.
    for (const connection of catalog.providerConnections) {
      const source = endpointToCspSource(connection.endpoint, connection.region);
      if (source) hosts.add(source);
    }

    // A bucket may live in a region other than its provider's default; admit
    // every registered bucket's regional origin so a not-yet-connected bucket
    // in another region is never blocked.
    const bucketCatalog = await fetchBucketCatalog(organization, accessToken);
    if (bucketCatalog) {
      for (const bucket of bucketCatalog.buckets) {
        hosts.add(`https://s3.${bucket.region}.amazonaws.com`);
      }
    }

    const connectionConfigs = await listConnections(user);
    for (const connectionConfig of connectionConfigs) {
      const resolved = resolveConnectionProviderWithGrants(
        catalog,
        connectionConfig,
        bucketCatalog,
      );
      if (!resolved) continue;
      const source = endpointToCspSource(resolved.endpoint, resolved.region);
      if (source) hosts.add(source);
    }

    return [...hosts];
  } catch (error) {
    console.warn(
      `${label} provider catalog lookup failed for org ${organization}, CSP connect-src fails closed:`,
      error,
    );
    return [];
  }
}

/** The bucket catalog, or undefined when the build has no portal lookup or
 * the lookup fails — the provider-default regions still cover the org. */
async function fetchBucketCatalog(organization: string, accessToken?: string) {
  if (cytarioConfig.providers.source !== "portal") return undefined;
  try {
    return await getBucketCatalog(organization, accessToken);
  } catch {
    return undefined;
  }
}

/** The endpoint's origin, else the regional S3 origin (AWS); https-only. */
function endpointToCspSource(endpoint: string | null, region: string): string | null {
  if (endpoint) {
    try {
      const parsed = new URL(endpoint);
      if (parsed.protocol !== "https:") {
        console.warn(`[csp] dropping non-https provider endpoint: ${parsed.host}`);
        return null;
      }
      // Mirror constructS3Url: an *.amazonaws.com endpoint is AWS, and the
      // region — not the endpoint — decides the origin the browser fetches.
      if (/\.amazonaws\.com$/i.test(parsed.hostname)) {
        return `https://s3.${region}.amazonaws.com`;
      }
      return parsed.origin;
    } catch {
      console.warn(`[csp] dropping unparseable provider endpoint: ${endpoint}`);
      return null;
    }
  }
  return `https://s3.${region}.amazonaws.com`;
}
