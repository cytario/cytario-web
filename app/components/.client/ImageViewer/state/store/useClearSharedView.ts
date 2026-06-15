import { useCallback } from "react";

import { select } from "./selectors";
import { useViewerStore } from "./ViewerStoreContext";
import { VIEW_STATE_PARAM } from "../../utils/viewStateUrl";
import { useSearchParam } from "~/hooks/useSearchParam";

/**
 * Returns a callback that drops the shared-link viewport (the ephemeral
 * `viewStateUrl` + `pendingUrlViewport`) and strips `?v` from the URL. Call it
 * inside ViewerStoreProvider + the router, then hand the callback to the
 * header-slot buttons, which render outside the provider and cannot subscribe.
 */
export const useClearSharedView = () => {
  const setViewStateUrl = useViewerStore(select.setViewStateUrl);
  const setPendingUrlViewport = useViewerStore(select.setPendingUrlViewport);
  const [, setViewportParam] = useSearchParam(VIEW_STATE_PARAM);

  return useCallback(() => {
    setViewStateUrl(null);
    setPendingUrlViewport(null);
    setViewportParam("");
  }, [setViewStateUrl, setPendingUrlViewport, setViewportParam]);
};
