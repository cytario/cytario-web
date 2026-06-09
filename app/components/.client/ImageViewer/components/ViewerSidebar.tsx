import { animate, motion, useMotionValue } from "motion/react";
import { useEffect } from "react";

import { ChannelsController } from "./ChannelsController/ChannelsController";
import { Presets } from "./FeatureBar/Presets";
import { ImagePreview } from "./Image/ImagePreview";
import { OverlaysController } from "./OverlaysController/OverlaysController";
import { SIDEBAR_MIN_WIDTH } from "~/components/Sidebar/createSidebarStore";
import { SidebarResizeHandle } from "~/components/Sidebar/SidebarResizeHandle";
import { useViewerSidebarStore } from "~/components/Sidebar/sidebarStores";

// Right image-controls sidebar (former FeatureBar): presets + preview +
// channels + overlays. Rendered inside ViewerStoreProvider so it keeps store
// access; pushes the canvas. Open by default on viewer arrival.
export function ViewerSidebar() {
  const isOpen = useViewerSidebarStore((s) => s.isOpen);
  const width = useViewerSidebarStore((s) => s.width);

  const motionWidth = useMotionValue(isOpen ? width : 0);
  useEffect(() => {
    const controls = animate(motionWidth, isOpen ? width : 0, { duration: 0.18 });
    return () => controls.stop();
  }, [isOpen, width, motionWidth]);

  return (
    <>
      <SidebarResizeHandle store={useViewerSidebarStore} side="right" motionWidth={motionWidth} />

      <motion.aside
        aria-label="Image controls"
        style={{ width: motionWidth }}
        className="shrink-0 flex flex-col overflow-hidden border-l border-(--color-border-default) bg-(--color-surface-default)"
        inert={!isOpen ? true : undefined}
      >
        <div className="flex h-full flex-col" style={{ minWidth: SIDEBAR_MIN_WIDTH }}>
          <Presets>
            <div className="block h-60 w-full shrink-0">
              <ImagePreview isInteractive />
            </div>
            <ChannelsController />
            <OverlaysController />
          </Presets>
        </div>
      </motion.aside>
    </>
  );
}
