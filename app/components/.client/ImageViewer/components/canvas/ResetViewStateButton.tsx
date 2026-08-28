import { IconButton } from "@cytario/design";
import { Dispatch, useMemo } from "react";

import { calculateViewStateToFit } from "./Measurements/calculateViewStateToFit";
import { ViewerStore, ViewPort, ViewState } from "../../state/store/types";

export const ResetViewStateButton = ({
  metadata,
  viewState,
  setViewState,
}: {
  metadata: ViewerStore["metadata"] | null;
  viewState: ViewState | null;
  setViewState: Dispatch<ViewState>;
}) => {
  const viewPort = useMemo<ViewPort>(
    () => ({
      width: viewState?.width ?? 0,
      height: viewState?.height ?? 0,
    }),
    [viewState],
  );

  return (
    <IconButton
      label="Reset View State"
      size="sm"
      icon="Fullscreen"
      onPress={() => {
        if (metadata) {
          const viewStateActive = calculateViewStateToFit(metadata, viewPort, {
            padding: 48,
          });
          setViewState(viewStateActive);
        }
      }}
    />
  );
};
