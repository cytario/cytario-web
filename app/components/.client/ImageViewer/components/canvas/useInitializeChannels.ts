import { useEffect } from "react";

import { select } from "../../state/store/selectors";
import { useViewerStore } from "../../state/store/ViewerStoreContext";

/**
 * Initializes channel states in the viewer store if they are not already set.
 * This hook runs once when the component mounts and whenever the metadata or
 * viewPort changes.
 */
export const useInitializeChannels = () => {
  const metadata = useViewerStore(select.metadata);
  const channelsState = useViewerStore(select.channelsState);
  const addChannelsState = useViewerStore(select.addChannelsState);

  useEffect(() => {
    if (!channelsState && metadata) {
      addChannelsState();
    }
  }, [metadata, channelsState, addChannelsState]);
};
