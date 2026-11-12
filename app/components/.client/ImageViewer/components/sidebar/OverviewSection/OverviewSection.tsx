import { IconButton } from "@cytario/design";
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
const CAPTURE_SECTION_CONTENT_ID = `section-${CAPTURE_SECTION_ID}-content`;

/** Sidebar overview: navigation thumbnail + magnification presets + reset. The
 *  Capture view action expands the Capture and export section and scrolls it
 *  into view — the same button reveals and navigates. */
export const OverviewSection = () => {
  const objectivePower = useViewerStore(select.objectivePower);

  const expandCaptureSection = useCallback(() => {
    const state = useViewerSidebarStore.getState();
    if (!(state.sections[CAPTURE_SECTION_ID]?.isOpen ?? true)) {
      state.toggleSection(CAPTURE_SECTION_ID);
    }
    // The section header scrolls into view inside the sidebar panel (or its
    // floating panel) once expanded.
    document
      .getElementById(CAPTURE_SECTION_CONTENT_ID)
      ?.closest("header")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return (
    <Section
      id="overview"
      title="Overview"
      icon="Image"
      actions={
        <>
          <ResetViewStateButton />
          <IconButton
            label="Capture view"
            size="sm"
            icon={CameraIcon}
            onPress={expandCaptureSection}
          />
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
