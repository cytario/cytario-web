import { Button, EmptyState, IconButton } from "@cytario/design";
import { Circle, CircleDot, Layers2 } from "lucide-react";
import { useState } from "react";

import { LoadOverlayModal } from "./OverlayPicker.modal";
import { OverlaysControllerItem } from "./OverlaysController.Item";
import { select } from "../../state/store/selectors";
import { useViewerStore } from "../../state/store/ViewerStoreContext";
import { FeatureItem } from "~/components/FeatureItem/FeatureItem";
import { FeatureItemSlider } from "~/components/FeatureItem/FeatureItemSlider";
import { isPointMode } from "~/utils/db/getGeomQuery";

/**
 * OverlaysController component manages the display and interaction of overlays in the image viewer.
 * It allows users to toggle the visibility of different overlays and provides options to add new overlays.
 */
export const OverlaysController = () => {
  const overlaysStates = useViewerStore(select.overlaysStates);
  const fillOpacity = useViewerStore(select.overlaysFillOpacity);
  const setFillOpacity = useViewerStore(select.setOverlaysFillOpacity);
  const showCellOutline = useViewerStore(select.showCellOutline);
  const setShowCellOutline = useViewerStore(select.setShowCellOutline);
  const currentZoom = useViewerStore(select.currentZoom);

  // Hide outline toggle when zoomed out (point mode doesn't have outlines)
  const isInPointMode = isPointMode(currentZoom);

  const entries = Object.entries(overlaysStates);
  // Local state (not useModal) because this modal must render inside
  // ViewerStoreProvider, which is outside ModalOutlet's tree.
  const [isOpen, setIsOpen] = useState(false);

  return (
    <FeatureItem
      title="Overlays"
      actions={
        <>
          {!isInPointMode && (
            <IconButton
              icon={showCellOutline ? CircleDot : Circle}
              aria-label={showCellOutline ? "Hide outlines" : "Show outlines"}
              onPress={() => setShowCellOutline(!showCellOutline)}
              variant="ghost"
              size="sm"
              className={`border-none ${showCellOutline ? "stroke-foreground" : "stroke-muted-foreground"}`}
            />
          )}
          <FeatureItemSlider
            aria-label="Overlay fill opacity"
            value={fillOpacity}
            onChange={setFillOpacity}
          />
        </>
      }
    >
      {entries.map(([resourceId, overlayState]) => (
        <OverlaysControllerItem
          key={resourceId}
          resourceId={resourceId}
          overlayState={overlayState}
        />
      ))}

      <footer className="px-3 pb-3">
        {entries.length === 0 ? (
          <EmptyState
            title="Add Overlay"
            description="Add parquet cell detection files"
            icon={Layers2}
            className="py-6"
            action={
              <Button variant="secondary" size="sm" onPress={() => setIsOpen(true)}>
                Add Overlay
              </Button>
            }
          />
        ) : (
          <Button variant="secondary" size="sm" onPress={() => setIsOpen(true)}>
            Add Overlay
          </Button>
        )}
      </footer>

      {isOpen && <LoadOverlayModal onClose={() => setIsOpen(false)} />}
    </FeatureItem>
  );
};
