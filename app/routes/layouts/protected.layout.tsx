import {
  Outlet,
  useLoaderData,
  type ClientLoaderFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";

import { ModalOutlet } from "./ModalOutlet";
import { authContext, authMiddleware } from "~/.server/auth/authMiddleware";
import { toIdentity } from "~/.server/auth/getUserInfo";
import { createLabel } from "~/.server/logging";
import { PluginSlots } from "~/components/PluginSlots";
import { ExplorerSidebar } from "~/components/Sidebar/Explorer/ExplorerSidebar";
import { cytarioConfig } from "~/config";
import { useCredentialsKeepAlive } from "~/hooks/useCredentialsKeepAlive";
import { useInitConnections } from "~/hooks/useInitConnections";
import { loadFavorites } from "~/routes/favorites/favorites.loader";
import { loadRecentlyViewed } from "~/routes/recent/recent.loader";
import { useConnectionHealthProbe } from "~/utils/connectionsStore/useConnectionHealthProbe";

export const middleware = [authMiddleware];

const label = createLabel("dashboard", "cyan");

// Response carries STS credentials — keep it out of every cache between origin
// and browser.
export const headers = () => ({ "Cache-Control": "no-store, private" });

export const loader = async ({ context }: LoaderFunctionArgs) => {
  const { connectionConfigs, credentials, credentialErrors, user } = context.get(authContext);
  // No shouldRevalidate gate: the credential keep-alive (C-242) drives an
  // explicit revalidation to re-mint STS credentials, and RR runs this loader
  // on every navigation. Recents/favorites are two indexed queries riding
  // along — cheaper than risking a gate that also starves credential refresh.
  //
  // This layout has no ErrorBoundary, so a rejected query here would 500 the
  // whole authenticated app. Recents/favorites are decorative — degrade to
  // empty rather than block navigation or the credential keep-alive.
  const [recentlyViewed, favorites] = await Promise.all([
    loadRecentlyViewed(user.sub, 20).catch((error) => {
      console.error(`${label} Failed to load recently viewed:`, error);
      return [];
    }),
    loadFavorites(user.sub).catch((error) => {
      console.error(`${label} Failed to load favorites:`, error);
      return [];
    }),
  ]);
  // Projection only — never the raw UserProfile, tokens, or credentials cross
  // to the client slot props.
  return {
    connectionConfigs,
    credentials,
    credentialErrors,
    identity: toIdentity(user),
    hostConfig: {
      portalUrl: cytarioConfig.endpoints.portal,
      webappUrl: cytarioConfig.endpoints.webapp,
    },
    recentlyViewed,
    favorites,
  };
};

// Identity clientLoader — see `app/root.tsx`; works around RR's bulk-fetch
// short-circuit during the initial `clientLoader.hydrate` pass.
export const clientLoader = ({ serverLoader }: ClientLoaderFunctionArgs) =>
  serverLoader<typeof loader>();

export default function ProtectedLayout() {
  const { connectionConfigs, credentials, credentialErrors, identity, hostConfig } =
    useLoaderData<typeof loader>();
  useInitConnections(connectionConfigs, credentials, credentialErrors);
  useCredentialsKeepAlive();
  useConnectionHealthProbe();

  return (
    <div className="flex h-full flex-col">
      <PluginSlots name="app-banner" identity={identity} hostConfig={hostConfig} />
      <div className="relative flex flex-1 min-h-0">
        <ExplorerSidebar />

        <div className="flex-1 overflow-x-hidden overflow-y-auto">
          <Outlet />
        </div>
        <ModalOutlet />
      </div>
      <PluginSlots name="app-overlay" identity={identity} hostConfig={hostConfig} />
    </div>
  );
}
