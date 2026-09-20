import { Button, EmptyState, IconButton } from "@cytario/design";
import { useState } from "react";

import { OverlayItem } from "./OverlayItem";
import { LoadOverlayModal } from "./OverlayPicker.modal";
import { useViewerStore } from "../../../state/store/core/ViewerStoreContext";
import { select } from "../../../state/store/selectors";
import { SECTION_GRID_3COL_WIDTH } from "../SectionRow/SectionGrid";
import { Section } from "~/components/Section/Section";
import { SectionSlider } from "~/components/Section/SectionSlider";
import { isPointMode } from "~/utils/db/getGeomQuery";

/** Sidebar overlays control: add, toggle, delete overlay layers. */
export const OverlaysSection = () => {
  const overlaysStates = useViewerStore(select.overlaysStates);
  const fillOpacity = useViewerStore(select.overlaysFillOpacity);
  const setFillOpacity = useViewerStore(select.setOverlaysFillOpacity);
  const showCellOutline = useViewerStore(select.showCellOutline);
  const setShowCellOutline = useViewerStore(select.setShowCellOutline);
  const currentZoom = useViewerStore(select.currentZoom);

  // Hide outline toggle in point mode (points don't have outlines).
  const isInPointMode = isPointMode(currentZoom);

  const entries = Object.entries(overlaysStates);

  // visible/total markers across all loaded overlay files — the same badge
  // semantic as the Channels panel.
  const markers = entries.flatMap(([, entry]) => Object.values(entry.markers));
  const badge = markers.length
    ? `${markers.filter((m) => m.isVisible).length}/${markers.length}`
    : undefined;

  // Local state (not useModal) because this modal must render inside
  // ViewerStoreProvider, which is outside ModalOutlet's tree.
  const [isOpen, setIsOpen] = useState(false);

  const addOverlayButton = (
    <Button size="sm" variant="ghost" iconLeft="Plus" onPress={() => setIsOpen(true)}>
      Add overlay
    </Button>
  );

  return (
    <>
      <Section
        id="overlays"
        title="Overlays"
        icon="Layers2"
        floatWidth={SECTION_GRID_3COL_WIDTH}
        badge={badge}
        actions={
          <>
            <IconButton
              icon="Plus"
              label="Add overlay"
              onPress={() => setIsOpen(true)}
              variant="ghost"
              size="xs"
            />
            <IconButton
              icon={showCellOutline ? "CircleDot" : "Circle"}
              label={showCellOutline ? "Hide outlines" : "Show outlines"}
              onPress={() => setShowCellOutline(!showCellOutline)}
              isDisabled={isInPointMode}
              variant="ghost"
              size="xs"
            />
            <SectionSlider
              aria-label="Overlay fill opacity"
              value={fillOpacity}
              onChange={setFillOpacity}
            />
          </>
        }
      >
        {entries.length === 0 ? (
          <EmptyState
            title="Add Overlay"
            description="Add parquet cell detection files"
            icon="Layers2"
            className="py-6"
            action={addOverlayButton}
          />
        ) : (
          entries.map(([resourceId, entry]) => (
            <OverlayItem key={resourceId} resourceId={resourceId} overlay={entry} />
          ))
        )}
      </Section>
      {isOpen && <LoadOverlayModal onClose={() => setIsOpen(false)} />}
    </>
  );
};
