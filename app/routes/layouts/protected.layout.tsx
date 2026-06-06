import {
  Outlet,
  useLoaderData,
  type ClientLoaderFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";

import { ModalOutlet } from "./ModalOutlet";
import { authContext, authMiddleware } from "~/.server/auth/authMiddleware";
import { toIdentity } from "~/.server/auth/getUserInfo";
import { PluginSlots } from "~/components/PluginSlots";
import { useInitConnections } from "~/hooks/useInitConnections";

export const middleware = [authMiddleware];

// Response carries STS credentials — keep it out of every cache between origin
// and browser.
export const headers = () => ({ "Cache-Control": "no-store, private" });

export const loader = async ({ context }: LoaderFunctionArgs) => {
  const { connectionConfigs, credentials, user } = context.get(authContext);
  // Projection only — never the raw UserProfile, tokens, or credentials cross
  // to the client slot props.
  return { connectionConfigs, credentials, identity: toIdentity(user) };
};

// Identity clientLoader — see `app/root.tsx`; works around RR's bulk-fetch
// short-circuit during the initial `clientLoader.hydrate` pass.
export const clientLoader = ({ serverLoader }: ClientLoaderFunctionArgs) =>
  serverLoader<typeof loader>();

export default function ProtectedLayout() {
  const { connectionConfigs, credentials, identity } = useLoaderData<typeof loader>();
  useInitConnections(connectionConfigs, credentials);

  return (
    <div className="flex h-full flex-col">
      <PluginSlots name="app-banner" identity={identity} />
      <div className="flex flex-1 min-h-0">
        <div className="flex-1 overflow-x-hidden overflow-y-auto">
          <Outlet />
        </div>
        <ModalOutlet />
      </div>
      <PluginSlots name="app-overlay" identity={identity} />
    </div>
  );
}
