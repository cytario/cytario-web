import { OverlayInfoModal } from "./OverlayInfoModal";
import { OverlaysControllerItem } from "./OverlaysController.Item";
import { select } from "../../state/selectors";
import { useViewerStore } from "../../state/ViewerStoreContext";
import { FeatureItem } from "../FeatureBar/FeatureItem";
import { ButtonLink } from "~/components/Controls/Button";
import { Placeholder } from "~/components/Placeholder";
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

  return (
    <FeatureItem
      title="Overlays"
      sliderValue={fillOpacity}
      onSliderChange={setFillOpacity}
      toggleValue={showCellOutline}
      onToggleChange={setShowCellOutline}
      toggleHidden={isInPointMode}
    >
      {entries.map(([resourceId, overlayState]) => (
        <OverlaysControllerItem
          key={resourceId}
          resourceId={resourceId}
          overlayState={overlayState}
        />
      ))}

      <footer className="p-2">
        {entries.length === 0 ? (
          <Placeholder
            title="Add Overlay"
            description="Add parquet cell detection files"
            icon="Layers2"
            cta={<ButtonLink to="?action=load-overlay">Add Overlay</ButtonLink>}
          />
        ) : (
          <ButtonLink to="?action=load-overlay">Add Overlay</ButtonLink>
        )}
      </footer>

      <OverlayInfoModal />
    </FeatureItem>
  );
};
