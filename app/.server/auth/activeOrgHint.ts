import { createCookie } from "react-router";

import { resolveActiveOrganization, type Organizations } from "./getUserInfo";
import { cytarioConfig } from "~/config";

/**
 * Untrusted hint, never a trust boundary: an alias is only honoured when
 * the token's own membership map carries it. Not `__Host-`-prefixed —
 * the cookie must be visible to the admin portal on the shared registrable
 * domain. Same name and settings as admin-portal's counterpart module.
 */
const ACTIVE_ORG_COOKIE_NAME = "cyt-active-org";

/** Localhost needs no Domain — ports already share cookies. */
const sharedDomain = (): string | undefined => {
  try {
    const host = new URL(cytarioConfig.endpoints.webapp).hostname;
    if (host === "localhost" || !host.includes(".")) return undefined;
    const parts = host.split(".");
    return parts.length > 2 ? parts.slice(1).join(".") : host;
  } catch {
    return undefined;
  }
};

const cookie = createCookie(ACTIVE_ORG_COOKIE_NAME, {
  path: "/",
  sameSite: "lax",
  maxAge: 60 * 60 * 24 * 30,
});

/** Takes the raw header string — `cookie` is a forbidden header on Requests. */
export const readActiveOrgHint = async (
  cookieHeader: string | null,
): Promise<string | undefined> => {
  const value = await cookie.parse(cookieHeader);
  return typeof value === "string" && value.length > 0 ? value : undefined;
};

/** The hint wins only when the membership map carries it. */
export const resolveLoginActiveOrg = async (
  hinted: string | undefined,
  organizations: Organizations,
  persisted: string | null | undefined,
): Promise<string | undefined> => {
  const honoured = hinted !== undefined && hinted in organizations;
  return resolveActiveOrganization(organizations, honoured ? hinted : (persisted ?? undefined));
};

/** Serializes a Set-Cookie header carrying the hint alias. */
export const activeOrgHintHeader = async (alias: string): Promise<string> =>
  cookie.serialize(alias, {
    domain: sharedDomain(),
    secure: cytarioConfig.cookie.secure,
    httpOnly: true,
  });
