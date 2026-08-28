import { IconButton } from "@cytario/design";
import { useMemo } from "react";

import { calculateViewStateToFit } from "./Measurements/calculateViewStateToFit";
import { select } from "../../state/store/selectors";
import { ViewPort } from "../../state/store/types";
import { useViewerStore } from "../../state/store/ViewerStoreContext";

/** Resets the active panel's view to fit the full image frame. */
export const ResetViewStateButton = () => {
  const metadata = useViewerStore(select.metadata);
  const viewStateActive = useViewerStore(select.viewStateActive);
  const setViewStateActive = useViewerStore(select.setViewStateActive);

  const viewPort = useMemo<ViewPort>(
    () => ({
      width: viewStateActive?.width ?? 0,
      height: viewStateActive?.height ?? 0,
    }),
    [viewStateActive],
  );

  return (
    <IconButton
      label="Reset View State"
      // variant="outline"
      icon="Fullscreen"
      onPress={() => {
        if (metadata) {
          setViewStateActive(calculateViewStateToFit(metadata, viewPort, { padding: 48 }));
        }
      }}
    />
  );
};
