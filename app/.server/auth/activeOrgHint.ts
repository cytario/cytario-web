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

const cookie = createCookie(ACTIVE_ORG_COOKIE_NAME, {
  path: "/",
  sameSite: "lax",
  maxAge: 60 * 60 * 24 * 30,
  domain: cytarioConfig.activeOrgCookieDomain || undefined,
  secure: cytarioConfig.cookie.secure,
  httpOnly: true,
});

/** Takes the raw header string — `cookie` is a forbidden header on Requests. */
export const readActiveOrgHint = async (
  cookieHeader: string | null,
): Promise<string | undefined> => {
  const value = await cookie.parse(cookieHeader);
  return typeof value === "string" && value.length > 0 ? value : undefined;
};

/** The default org: the hint when the token carries it, else the persisted
 * preference (each membership-validated by resolveActiveOrganization). */
export const pickDefaultOrganization = (
  organizations: Organizations,
  hinted: string | undefined,
  persisted: string | null | undefined,
): string | undefined =>
  resolveActiveOrganization(
    organizations,
    hinted !== undefined && hinted in organizations ? hinted : (persisted ?? undefined),
  );

/** Serializes a Set-Cookie header carrying the hint alias. */
export const activeOrgHintHeader = (alias: string): Promise<string> => cookie.serialize(alias);
