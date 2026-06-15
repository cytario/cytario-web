import { IconButton } from "@cytario/design";
import { Share2 } from "lucide-react";
import { useCallback } from "react";

import { ViewerStore, ViewState } from "../../state/store/types";
import { encodeViewState, VIEW_STATE_PARAM } from "../../utils/viewStateUrl";
import { toastBridge } from "~/toast-bridge";

// Rendered through the layout header slot, outside ViewerStoreProvider, so it
// takes pure props. toastBridge is a plain singleton (not a hook), safe here.
export const ShareViewButton = ({
  metadata,
  viewStateActive,
  viewStateUrl,
}: {
  metadata: ViewerStore["metadata"] | null;
  viewStateActive: ViewState | null;
  viewStateUrl: ViewState | null;
}) => {
  // Prefer the shared-link viewport while it's still in effect so re-sharing
  // before any interaction reproduces the same link.
  const effectiveViewState = viewStateUrl ?? viewStateActive;
  const canShare = Boolean(effectiveViewState && metadata);

  const handleShare = useCallback(() => {
    if (!effectiveViewState) return;
    const url = `${window.location.origin}${window.location.pathname}?${VIEW_STATE_PARAM}=${encodeViewState(effectiveViewState)}`;
    navigator.clipboard
      .writeText(url)
      .then(() =>
        toastBridge.emit({
          variant: "success",
          message: "View link copied — zoom and position only, channel settings not included",
        }),
      )
      .catch(() => toastBridge.emit({ variant: "error", message: "Could not copy view link" }));
  }, [effectiveViewState]);

  return (
    <IconButton
      aria-label="Share view"
      className="w-10"
      icon={Share2}
      isDisabled={!canShare}
      onPress={handleShare}
    />
  );
};
