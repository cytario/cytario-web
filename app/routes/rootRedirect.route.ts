import { redirect, type LoaderFunctionArgs } from "react-router";

import { readActiveOrgHint } from "~/.server/auth/activeOrgHint";
import { getSessionData } from "~/.server/auth/getSession";
import { resolveActiveOrganization } from "~/.server/auth/getUserInfo";
import { getPreferredOrg } from "~/.server/auth/orgPreference.server";
import { sessionContext } from "~/.server/auth/sessionMiddleware";
import { sessionStorage } from "~/.server/auth/sessionStorage";
import { orgPath } from "~/utils/orgPath";

/**
 * The bare app root: land the user in their default organization (cross-app
 * hint, else the persisted preference, membership-validated) — the same
 * derivation authMiddleware uses for org-less requests. Sits inside the
 * protected layout, so an unauthenticated visit takes the login redirect first.
 */
export const loader = async ({ context, request }: LoaderFunctionArgs) => {
  const session = context.get(sessionContext);
  if (!session) throw new Error("Session not found in context.");

  const { user } = await getSessionData(session);
  if (!user) return redirect("/login");

  const hinted = await readActiveOrgHint(request.headers.get("cookie"));
  const preferred = hinted ?? (await getPreferredOrg(user.sub).catch(() => null));
  const organization = resolveActiveOrganization(user.organizations, preferred ?? undefined);

  if (!organization) return redirect("/onboarding");
  return redirect(orgPath(organization, "/"), {
    headers: { "Set-Cookie": await sessionStorage.commitSession(session) },
  });
};
