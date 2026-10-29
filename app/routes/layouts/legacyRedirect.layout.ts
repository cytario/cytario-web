import { redirect, type LoaderFunctionArgs } from "react-router";

import { authContext } from "~/.server/auth/authMiddleware";
import { legacyRedirectPath } from "~/utils/orgPath";

/**
 * Un-prefixed app URLs predate the `/o/:org` prefix: bookmarks, docs and plugin
 * links still carry them. Matches everything the specific routes do not, and
 * answers with a redirect into the session's active organization — an unknown
 * path stays a 404 through the root fallback instead.
 */
export const loader = ({ request, context }: LoaderFunctionArgs) => {
  const { pathname, search } = new URL(request.url);
  const organization = context.get(authContext).activeOrganization ?? undefined;
  const target = legacyRedirectPath(pathname, organization);

  if (!target) throw new Response("Not Found", { status: 404 });

  return redirect(`${target}${search}`);
};
