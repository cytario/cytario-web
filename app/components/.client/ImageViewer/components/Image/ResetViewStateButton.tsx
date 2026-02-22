import { IconButton } from "@cytario/design";
import { Fullscreen } from "lucide-react";
import { Dispatch, useMemo } from "react";

import { ViewerStore, ViewPort, ViewState } from "../../state/types";
import { calculateViewStateToFit } from "../Measurements/calculateViewStateToFit";

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
      aria-label="Reset View State"
      className="w-10"
      icon={Fullscreen}
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
