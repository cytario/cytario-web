import { useEffect, useRef } from "react";

import { select } from "../state/store/selectors";
import { ViewerStore, ViewState } from "../state/store/types";
import { useClearSharedView } from "../state/store/useClearSharedView";
import { useViewerStore } from "../state/store/ViewerStoreContext";
import { decodeViewState, VIEW_STATE_PARAM } from "../utils/viewStateUrl";
import { useLayoutStore } from "~/components/DirectoryView/useLayoutStore";
import { useSearchParam } from "~/hooks/useSearchParam";

export const ViewerHeader = ({
  children,
}: {
  children: (props: {
    metadata: ViewerStore["metadata"] | null;
    viewStateActive: ViewState | null;
    viewStateUrl: ViewState | null;
    setViewStateActive: (viewState: ViewState) => void;
    clearSharedView: () => void;
  }) => React.JSX.Element;
}) => {
  const setHeaderSlot = useLayoutStore((s) => s.setHeaderSlot);

  const metadata = useViewerStore(select.metadata);
  const viewStateActive = useViewerStore(select.viewStateActive);
  const viewStateUrl = useViewerStore(select.viewStateUrl);
  const setViewStateActive = useViewerStore(select.setViewStateActive);
  const setPendingUrlViewport = useViewerStore(select.setPendingUrlViewport);

  // Built here, inside the provider + router, because the slotted header buttons
  // render outside ViewerStoreProvider and cannot call store/router hooks.
  const clearSharedView = useClearSharedView();

  // Read the shared `?v=` viewport once into the ephemeral pendingUrlViewport
  // (not viewStateActive), so opening a shared link never overwrites the
  // opener's persisted view. ImagePanel expands it once dimensions are known.
  const [viewportParam, setViewportParam] = useSearchParam(VIEW_STATE_PARAM);
  const hydrated = useRef(false);
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    const decoded = decodeViewState(viewportParam);
    if (!decoded) return;
    setPendingUrlViewport(decoded);
    // Consume the param: once seeded into the store, strip it so a later reload
    // restores the user's own (committed) view instead of re-applying the link.
    setViewportParam("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (children) {
      setHeaderSlot(
        children({ metadata, viewStateActive, viewStateUrl, setViewStateActive, clearSharedView }),
      );
    }

    return () => {
      setHeaderSlot(null);
    };
  }, [
    setHeaderSlot,
    children,
    metadata,
    viewStateActive,
    viewStateUrl,
    setViewStateActive,
    clearSharedView,
  ]);

  return null;
};
