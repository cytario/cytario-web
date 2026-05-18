import {
  Outlet,
  useLoaderData,
  type ClientLoaderFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";

import { ModalOutlet } from "./ModalOutlet";
import { authContext, authMiddleware } from "~/.server/auth/authMiddleware";
import { useInitConnections } from "~/hooks/useInitConnections";

export const middleware = [authMiddleware];

// Response carries STS credentials — keep it out of every cache between origin
// and browser.
export const headers = () => ({ "Cache-Control": "no-store, private" });

export const loader = async ({ context }: LoaderFunctionArgs) => {
  const { connectionConfigs, credentials } = context.get(authContext);
  return { connectionConfigs, credentials };
};

// Identity clientLoader — see `app/root.tsx`; works around RR's bulk-fetch
// short-circuit during the initial `clientLoader.hydrate` pass.
export const clientLoader = ({ serverLoader }: ClientLoaderFunctionArgs) =>
  serverLoader<typeof loader>();

export default function ProtectedLayout() {
  const { connectionConfigs, credentials } = useLoaderData<typeof loader>();
  useInitConnections(connectionConfigs, credentials);

  return (
    <div className="flex h-full">
      <div className="flex-1 overflow-x-hidden overflow-y-auto">
        <Outlet />
      </div>
      <ModalOutlet />
    </div>
  );
}
