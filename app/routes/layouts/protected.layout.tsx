import { Outlet, useLoaderData, type LoaderFunctionArgs } from "react-router";

import { ModalOutlet } from "./ModalOutlet";
import { authContext, authMiddleware } from "~/.server/auth/authMiddleware";
import { useInitConnections } from "~/hooks/useInitConnections";

export const middleware = [authMiddleware];

export const loader = async ({ context }: LoaderFunctionArgs) => {
  const { connectionConfigs, credentials } = context.get(authContext);
  return { connectionConfigs, credentials };
};

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
