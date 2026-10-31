import { type UserProfile, withActiveOrganization } from "./getUserInfo";
import { setPreferredOrg } from "./orgPreference.server";
import { type CytarioSession, sessionStorage } from "./sessionStorage";

export class UnknownOrganizationError extends Error {
  constructor(alias: string) {
    super(`The token carries no membership for organization "${alias}".`);
    this.name = "UnknownOrganizationError";
  }
}

/**
 * Switches the session to `alias` and persists it as the user's last-used org.
 *
 * The alias must be one the token already carries: the exchange only ever mints
 * a token for a membership, so accepting an arbitrary string here would let a
 * caller park the session on an org it can never mint for. Returns the
 * re-derived profile plus the cookie the caller must send with its response.
 */
export async function selectActiveOrganization(
  session: CytarioSession,
  user: UserProfile,
  alias: string,
): Promise<{ user: UserProfile; setCookie: string }> {
  if (!user.organizations[alias]) {
    throw new UnknownOrganizationError(alias);
  }

  const switchedUser = withActiveOrganization(user, alias);
  session.set("user", switchedUser);
  session.set("activeOrganization", alias);

  await setPreferredOrg(user.sub, alias).catch((error: unknown) => {
    // The preference is a convenience for the next login; the session already
    // carries the switch, so a store failure must not fail the request.
    console.warn("[auth] Storing the org preference failed:", error);
  });

  return { user: switchedUser, setCookie: await sessionStorage.commitSession(session) };
}
