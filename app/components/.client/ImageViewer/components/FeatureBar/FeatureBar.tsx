import { motion, useMotionValue } from "motion/react";

import { FeatureBarDragHandle } from "./FeatureBarDragHandle";
import { FeatureBarToggle } from "./FeatureBarToggle";
import { Presets } from "./Presets";
import { useFeatureBarStore } from "./useFeatureBar";
import { ChannelsController } from "../ChannelsController/ChannelsController";
import { ImagePreview } from "../Image/ImagePreview";
import { OverlaysController } from "../OverlaysController/OverlaysController";

export const FeatureBar = () => {
  const { width } = useFeatureBarStore();
  const motionWidth = useMotionValue(width);

  return (
    <>
      {/* FeatureBar */}
      <motion.div
        role="toolbar"
        className="relative shrink-0 bg-slate-950 h-full overflow-hidden"
        style={{ width: motionWidth }}
      >
        <Presets>
          <div className="block w-full h-60 shrink-0">
            <ImagePreview isInteractive />
          </div>
          <ChannelsController />
          <OverlaysController />
        </Presets>
      </motion.div>

      {/* Adjust Width Drag Handle */}
      <FeatureBarDragHandle motionWidth={motionWidth} />

      {/* Toggle Width Button */}
      <FeatureBarToggle motionWidth={motionWidth} />
    </>
  );
};
