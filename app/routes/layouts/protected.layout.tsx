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
import { ExplorerTab } from "~/components/Sidebar/Explorer/ExplorerTab";
import { SIDEBAR_SEARCH_INPUT_ID } from "~/components/Sidebar/Explorer/SidebarSearchInput";
import { Sidebar, SIDEBAR } from "~/components/Sidebar/Sidebar";
import { useNavSidebarStore } from "~/components/Sidebar/sidebarStores";
import { useCredentialsKeepAlive } from "~/hooks/useCredentialsKeepAlive";
import { useInitConnections } from "~/hooks/useInitConnections";
import { useConnectionHealthProbe } from "~/utils/connectionsStore/useConnectionHealthProbe";

export const middleware = [authMiddleware];

// Response carries STS credentials — keep it out of every cache between origin
// and browser.
export const headers = () => ({ "Cache-Control": "no-store, private" });

export const loader = async ({ context }: LoaderFunctionArgs) => {
  const { connectionConfigs, credentials, credentialErrors, user } = context.get(authContext);
  // Projection only — never the raw UserProfile, tokens, or credentials cross
  // to the client slot props.
  return { connectionConfigs, credentials, credentialErrors, identity: toIdentity(user) };
};

// Identity clientLoader — see `app/root.tsx`; works around RR's bulk-fetch
// short-circuit during the initial `clientLoader.hydrate` pass.
export const clientLoader = ({ serverLoader }: ClientLoaderFunctionArgs) =>
  serverLoader<typeof loader>();

export default function ProtectedLayout() {
  const { connectionConfigs, credentials, credentialErrors, identity } =
    useLoaderData<typeof loader>();
  useInitConnections(connectionConfigs, credentials, credentialErrors);
  useCredentialsKeepAlive();
  useConnectionHealthProbe();

  return (
    <div className="flex h-full flex-col">
      <PluginSlots name="app-banner" identity={identity} />
      <div className="relative flex flex-1 min-h-0">
        <Sidebar
          name={SIDEBAR.nav}
          side="left"
          store={useNavSidebarStore}
          toggleShortcut="mod+b"
          onOpen={() => document.getElementById(SIDEBAR_SEARCH_INPUT_ID)?.focus()}
        >
          <ExplorerTab />
        </Sidebar>
        <div className="flex-1 overflow-x-hidden overflow-y-auto">
          <Outlet />
        </div>
        <ModalOutlet />
      </div>
      <PluginSlots name="app-overlay" identity={identity} />
    </div>
  );
}
