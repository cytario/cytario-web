import { Dispatch, useMemo } from "react";

import { ViewerStore, ViewPort, ViewState } from "../../state/types";
import { calculateViewStateToFit } from "../Measurements/calculateViewStateToFit";
import { IconButton } from "~/components/Controls";

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
      className="w-10"
      icon="Fullscreen"
      onClick={() => {
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
