import { toIdentity, type UserProfile } from "./auth/getUserInfo";
import { exchangePortalAccessToken } from "./auth/orgTokenExchange";
import type { AuthTokens } from "./auth/sessionStorage";
import { createLabel } from "./logging";
import { hasGates, runGates } from "./pluginGates";
import { findProviderConnection, getProviderCatalog } from "./providers/providerCatalog.server";
import type { GateRequest } from "@cytario/plugin-api";
import { cytarioConfig } from "~/config";
import { getConnection } from "~/routes/connections/connections.server";
import type { ConnectionGateFacts, LockedConnection } from "~/utils/lockedConnection";
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

const formContentType = (request: Request): boolean => {
  const contentType = request.headers.get("content-type") ?? "";
  return FORM_CONTENT_TYPES.some((type) => contentType.includes(type));
};

/**
 * The form fields the gate's fact may name. Read off a clone so the action
 * still owns the body; validation stays there too — this only feeds the fact.
 */
async function submittedFields(request: Request): Promise<FormData | undefined> {
  if (!formContentType(request)) return undefined;
  try {
    return await request.clone().formData();
  } catch (error) {
    console.warn(`${label} Could not read the submitted form:`, error);
    return undefined;
  }
}

const stringField = (form: FormData, name: string): string | undefined => {
  const value = form.get(name);
  return typeof value === "string" && value !== "" ? value : undefined;
};

interface GateResourceRequest {
  request: Request;
  url: URL;
  user: UserProfile;
  organization: string;
  sessionId: string;
  authTokens: AuthTokens;
}

/**
 * The facts a gate may consult, resolved ahead of credential minting. Every
 * fact is best-effort; an unknown one is left absent rather than guessed.
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

  const publicnessOf = async (providerConnectionId: string): Promise<boolean | undefined> =>
    providerIsPublic(
      organization,
      providerConnectionId,
      await portalAccessTokenFor(organization, sessionId, authTokens.accessToken),
    );

  /**
   * The facts of an existing connection: only the connection row names its
   * provider, so this is one org-scoped, canSee-filtered read.
   */
  const existingConnectionFacts = async (
    connectionId: string,
  ): Promise<GateResource | undefined> => {
    const connection = await getConnection(user, organization, connectionId).catch(
      (error: unknown) => {
        console.warn(`${label} Could not read the connection for its gate facts:`, error);
        return null;
      },
    );
    if (!connection) return { connectionId };
    return {
      connectionId,
      isPublic: await publicnessOf(connection.providerConnectionId),
    };
  };

  // The path names the connection.
  const connectionId =
    connectionIdFromOrgPath(url.pathname) ?? connectionIdFromCyberduckProfilePath(url.pathname);
  if (connectionId) return existingConnectionFacts(connectionId);

  // Only the org-root writes carry a connection reference; every other
  // org-scoped path addresses something else.
  if (request.method !== "POST" && request.method !== "PATCH") return undefined;
  if (organizationFromPath(url.pathname) === undefined || stripOrgPath(url.pathname) !== "/") {
    return undefined;
  }

  const form = await submittedFields(request);
  if (!form) return undefined;

  // A create submit names the provider it will reference — there is no target
  // row yet, so the submitted reference is the fact. Every other intent acts on
  // an EXISTING connection, and the fact must describe that target: trusting a
  // submitted provider reference there would let a write on a private
  // connection claim a public provider.
  const isCreateIntent = request.method === "POST" && stringField(form, "_intent") === undefined;
  if (isCreateIntent) {
    const providerConnectionId = stringField(form, "providerConnectionId");
    if (!providerConnectionId) return undefined;
    return { isPublic: await publicnessOf(providerConnectionId) };
  }

  const targetConnectionId = stringField(form, "connectionId");
  if (targetConnectionId) return existingConnectionFacts(targetConnectionId);

  // A share with no target row yet (it is creating one) still names the
  // provider it builds from; nothing else may claim a provider fact.
  if (stringField(form, "_intent") === "share") {
    const providerConnectionId = stringField(form, "providerConnectionId");
    if (!providerConnectionId) return undefined;
    return { isPublic: await publicnessOf(providerConnectionId) };
  }

  return undefined;
}

/**
 * The listed connections a gate reports visible-locked, asked once per
 * connection — the same question a browse of it would ask, so the listing and
 * the browse cannot disagree. A `lock` or a `deny` answer marks the row: either
 * way the request for that connection would not proceed. The facts come from
 * the caller's own provider resolution, so no extra catalog read runs here.
 */
export async function lockedConnections(
  user: UserProfile,
  organization: string,
  connections: readonly ConnectionGateFacts[],
): Promise<LockedConnection[]> {
  if (!hasGates()) return [];

  const identity = toIdentity(user, organization);
  const verdicts = await Promise.all(
    connections.map(async ({ connectionId, isPublic }): Promise<LockedConnection | undefined> => {
      const outcome = await runGates({
        url: orgPath(organization, `/${connectionId}`),
        method: "GET",
        identity,
        resource: { connectionId, ...(isPublic === undefined ? {} : { isPublic }) },
      });
      if (outcome.kind !== "lock" && outcome.kind !== "deny") return undefined;
      // The first locked connection's copy is the whole set's copy in practice
      // (one gate, one plan, one call to action); the host carries it verbatim.
      const { message, resolveUrl, resolveLabel } = outcome;
      return {
        id: connectionId,
        ...(message ? { message } : {}),
        ...(resolveUrl ? { resolveUrl } : {}),
        ...(resolveLabel ? { resolveLabel } : {}),
      };
    }),
  );

  return verdicts.filter((verdict): verdict is LockedConnection => verdict !== undefined);
}
