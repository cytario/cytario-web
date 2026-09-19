import { useRouteLoaderData } from "react-router";

import { RootLoaderResponse } from "~/root";

export function useCurrentUser() {
  const data = useRouteLoaderData<RootLoaderResponse>("root");
  return data?.user;
}
