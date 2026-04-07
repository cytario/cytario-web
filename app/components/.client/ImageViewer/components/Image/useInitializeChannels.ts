import { useEffect, useRef } from "react";

import { select } from "../../state/store/selectors";
import { type ViewPort } from "../../state/store/types";
import { useViewerStore } from "../../state/store/ViewerStoreContext";

/**
 * Initializes channel states in the viewer store if they are not already set.
 * This hook runs once when the component mounts and whenever the metadata or
 * viewPort changes.
 */
export const useInitializeChannels = (viewPort: ViewPort) => {
  const isInitialized = useRef(false);

  const metadata = useViewerStore(select.metadata);
  const channelsState = useViewerStore(select.channelsState);
  const addChannelsState = useViewerStore(select.addChannelsState);
  const setChannelVisibility = useViewerStore(select.setChannelVisibility);

  useEffect(() => {
    if (!isInitialized.current && metadata && viewPort && !channelsState) {
      isInitialized.current = true;
      addChannelsState();
    }
  }, [
    metadata,
    viewPort,
    channelsState,
    addChannelsState,
    setChannelVisibility,
  ]);
};
