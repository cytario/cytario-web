import { toIdentity, type UserProfile } from "./auth/getUserInfo";
import { exchangePortalAccessToken } from "./auth/orgTokenExchange";
import type { AuthTokens } from "./auth/sessionStorage";
import { createLabel } from "./logging";
import { hasGates, runGates } from "./pluginGates";
import { findProviderConnection, getProviderCatalog } from "./providers/providerCatalog.server";
import type { GateRequest } from "@cytario/plugin-api";
import { cytarioConfig } from "~/config";
import { getConnection } from "~/routes/connections/connections.server";
import {
  connectionIdFromCyberduckProfilePath,
  connectionIdFromOrgPath,
  organizationFromPath,
  orgPath,
  stripOrgPath,
} from "~/utils/orgPath";

export type GateResource = NonNullable<GateRequest["resource"]>;

const label = createLabel("gates", "magenta");

const FORM_CONTENT_TYPES = ["application/x-www-form-urlencoded", "multipart/form-data"];

/**
 * The provider catalog is advisory here: an unavailable catalog, an unreachable
 * portal or a stale reference leaves the fact unknown rather than failing the
 * request — the plugin decides what an unknown fact means.
 */
async function providerIsPublic(
  organization: string,
  providerConnectionId: string,
  accessToken: string | undefined,
): Promise<boolean | undefined> {
  try {
    const catalog = await getProviderCatalog(organization, accessToken);
    return findProviderConnection(catalog, providerConnectionId)?.isPublic;
  } catch (error) {
    console.warn(`${label} Could not resolve the provider's publicness:`, error);
    return undefined;
  }
}

/** The narrow per-org portal token the catalog lookup presents, when the build has a portal. */
async function portalAccessTokenFor(
  organization: string,
  sessionId: string,
  subjectToken: string,
): Promise<string | undefined> {
  if (cytarioConfig.providers.source !== "portal") return undefined;
  try {
    return await exchangePortalAccessToken(sessionId, organization, subjectToken);
  } catch (error) {
    console.warn(`${label} Portal token exchange failed, the catalog fact stays unknown:`, error);
    return undefined;
  }
}

/**
 * The `providerConnectionId` a create-connection form submits. Read off a clone
 * so the action still owns the body; validation stays there too — this only
 * feeds the gate's fact.
 */
async function submittedProviderConnectionId(request: Request): Promise<string | undefined> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!FORM_CONTENT_TYPES.some((type) => contentType.includes(type))) return undefined;
  try {
    const value = (await request.clone().formData()).get("providerConnectionId");
    return typeof value === "string" && value !== "" ? value : undefined;
  } catch (error) {
    console.warn(`${label} Could not read the create-connection form:`, error);
    return undefined;
  }
}

interface GateResourceRequest {
  request: Request;
  url: URL;
  user: UserProfile;
  organization: string;
  sessionId: string;
  authTokens: AuthTokens;
}

/**
 * The resource facts a gate may consult, resolved ahead of credential minting:
 * the connection id a `/:org/:id/*` or `/api/v1/:org/cyberduck-profile/:id` path
 * names and that connection's provider publicness, or — for a create-connection
 * submit to the org root — the submitted provider's. Every fact is best-effort;
 * an unknown one is left absent rather than guessed.
 */
export async function resolveGateResource({
  request,
  url,
  user,
  organization,
  sessionId,
  authTokens,
}: GateResourceRequest): Promise<GateResource | undefined> {
  // No plugin gates in this build: skip the tenant read and catalog lookup
  // their input would cost.
  if (!hasGates()) return undefined;

  // The path names the connection, but only the connection row names its
  // provider — a single org-scoped, canSee-filtered read, never a listing.
  const connectionId =
    connectionIdFromOrgPath(url.pathname) ?? connectionIdFromCyberduckProfilePath(url.pathname);
  if (connectionId) {
    const connection = await getConnection(user, organization, connectionId).catch(
      (error: unknown) => {
        console.warn(`${label} Could not read the connection for its gate facts:`, error);
        return null;
      },
    );
    if (!connection) return { connectionId };
    return {
      connectionId,
      isPublic: await providerIsPublic(
        organization,
        connection.providerConnectionId,
        await portalAccessTokenFor(organization, sessionId, authTokens.accessToken),
      ),
    };
  }

  if (request.method !== "POST") return undefined;
  // The create-connection form posts to the org root; any other org-scoped POST
  // carries no provider reference to resolve.
  if (organizationFromPath(url.pathname) === undefined || stripOrgPath(url.pathname) !== "/") {
    return undefined;
  }

  const providerConnectionId = await submittedProviderConnectionId(request);
  if (!providerConnectionId) return undefined;
  return {
    isPublic: await providerIsPublic(
      organization,
      providerConnectionId,
      await portalAccessTokenFor(organization, sessionId, authTokens.accessToken),
    ),
  };
}

/** A listed connection and the publicness the caller already resolved for it. */
export interface ListedConnectionFacts extends GateResource {
  connectionId: string;
}

/**
 * The listed connections a gate reports visible-locked, asked once per
 * connection — the same question a browse of it would ask, so the listing and
 * the browse cannot disagree. A `lock` or a `deny` answer marks the row: either
 * way the request for that connection would not proceed. The facts come from
 * the caller's own provider resolution, so no extra catalog read runs here.
 */
export async function lockedConnectionIds(
  user: UserProfile,
  organization: string,
  connections: readonly ListedConnectionFacts[],
): Promise<string[]> {
  if (!hasGates()) return [];

  const identity = toIdentity(user, organization);
  const verdicts = await Promise.all(
    connections.map(async ({ connectionId, isPublic }) => {
      const outcome = await runGates({
        url: orgPath(organization, `/${connectionId}`),
        method: "GET",
        identity,
        resource: { connectionId, ...(isPublic === undefined ? {} : { isPublic }) },
      });
      return outcome.kind === "lock" || outcome.kind === "deny" ? connectionId : undefined;
    }),
  );

  return verdicts.filter((id): id is string => id !== undefined);
}
