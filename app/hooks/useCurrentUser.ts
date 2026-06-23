import { useRouteLoaderData } from "react-router";

import { RootLoaderResponse } from "~/root";

/** The signed-in user from the root loader, or undefined before hydration. */
export function useCurrentUser() {
  const data = useRouteLoaderData<RootLoaderResponse>("root");
  return data?.user;
}
