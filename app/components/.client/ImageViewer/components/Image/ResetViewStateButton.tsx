import { IconButton } from "@cytario/design";
import { Minimize2 } from "lucide-react";
import { Dispatch } from "react";

import { ViewerStore, ViewState } from "../../state/store/types";
import { calculateViewStateToFit } from "../Measurements/calculateViewStateToFit";

// Rendered through the layout header slot, outside ViewerStoreProvider, so it
// takes pure props: store values and clearSharedView are supplied by ViewerHeader.
export const ResetViewStateButton = ({
  metadata,
  viewState,
  viewStateUrl,
  setViewState,
  clearSharedView,
}: {
  metadata: ViewerStore["metadata"] | null;
  viewState: ViewState | null;
  viewStateUrl: ViewState | null;
  setViewState: Dispatch<ViewState>;
  clearSharedView: () => void;
}) => {
  // Fall back to the shared-link viewport for dimensions on a first visit via a
  // shared link, when there is no persisted active view yet.
  const sizeSource = viewState ?? viewStateUrl;

  return (
    <IconButton
      aria-label="Reset view"
      className="w-10"
      icon={Minimize2}
      onPress={() => {
        if (!metadata) return;
        const viewPort = { width: sizeSource?.width ?? 0, height: sizeSource?.height ?? 0 };
        setViewState(calculateViewStateToFit(metadata, viewPort, { padding: 48 }));
        clearSharedView();
      }}
    />
  );
};
