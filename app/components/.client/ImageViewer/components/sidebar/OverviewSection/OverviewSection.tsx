import { IconButton } from "@cytario/design";
import { Suspense, lazy, useState } from "react";

import { Magnifier } from "./Magnifier";
import { useViewerStore } from "../../../state/store/core/ViewerStoreContext";
import { select } from "../../../state/store/selectors";
import { ImagePreview } from "../../canvas/ImagePreview";
import { ResetViewStateButton } from "../../canvas/ResetViewStateButton";
import { CameraIcon } from "../../export/CameraIcon";
import { Section } from "~/components/Section/Section";

const ExportDialog = lazy(() =>
  import("../../export/ExportDialog").then((module) => ({ default: module.ExportDialog })),
);

/** Sidebar overview: navigation thumbnail + magnification presets + reset. */
export const OverviewSection = () => {
  const objectivePower = useViewerStore(select.objectivePower);
  const [isExportOpen, setIsExportOpen] = useState(false);

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
            onPress={() => setIsExportOpen(true)}
          />
        </>
      }
    >
      <div className="block h-44 w-full shrink-0 tall:h-60">
        <ImagePreview isInteractive />
      </div>

      <Magnifier objectivePower={objectivePower} />

      {isExportOpen && (
        <Suspense fallback={null}>
          <ExportDialog isOpen={isExportOpen} onClose={() => setIsExportOpen(false)} />
        </Suspense>
      )}
    </Section>
  );
};
