import { IconButton, Tooltip } from "@cytario/design";
import { useCallback } from "react";

import { Magnifier } from "./Magnifier";
import { useViewerStore } from "../../../state/store/core/ViewerStoreContext";
import { select } from "../../../state/store/selectors";
import { ImagePreview } from "../../canvas/ImagePreview";
import { ResetViewStateButton } from "../../canvas/ResetViewStateButton";
import { CameraIcon } from "../../export/CameraIcon";
import { useViewerSidebarStore } from "../../useViewerSidebarStore";
import { Section } from "~/components/Section/Section";

const CAPTURE_SECTION_ID = "capture";
const CAPTURE_SECTION_TITLE_ID = `section-${CAPTURE_SECTION_ID}-title`;

/** Sidebar overview: navigation thumbnail + magnification presets + reset. The
 *  Capture view action expands the Capture and export section and scrolls it
 *  into view — the same button reveals and navigates. */
export const OverviewSection = () => {
  const objectivePower = useViewerStore(select.objectivePower);

  const expandCaptureSection = useCallback(() => {
    // An entry is absent until first toggled — absent means open (the Section
    // default), so only toggle when the entry says closed.
    const store = useViewerSidebarStore.getState();
    if (store.sections[CAPTURE_SECTION_ID]?.isOpen === false) {
      store.toggleSection(CAPTURE_SECTION_ID);
    }
    // The section title scrolls into view once the open state has rendered.
    requestAnimationFrame(() => {
      document
        .getElementById(CAPTURE_SECTION_TITLE_ID)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  return (
    <Section
      id="overview"
      title="Overview"
      icon="Image"
      actions={
        <>
          <ResetViewStateButton />
          <Tooltip content="Capture view — jump to the export section">
            <IconButton
              label="Capture view"
              size="sm"
              icon={CameraIcon}
              onPress={expandCaptureSection}
            />
          </Tooltip>
        </>
      }
    >
      <div className="block h-44 w-full shrink-0 tall:h-60">
        <ImagePreview isInteractive />
      </div>

      <Magnifier objectivePower={objectivePower} />
    </Section>
  );
};
