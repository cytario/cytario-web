import { MotionValue } from "motion/react";

import { useFeatureBarStore } from "./useFeatureBar";
import { IconButton } from "~/components/Controls/IconButton";

export const FeatureBarToggle = ({
  motionWidth,
}: {
  motionWidth: MotionValue<number>;
}) => {
  const { minWidth, setWidth, width } = useFeatureBarStore();

  return (
    <IconButton
      onClick={() => {
        if (motionWidth.isAnimating()) motionWidth.stop();
        const currentX = motionWidth.get();
        setWidth(Math.max(currentX, minWidth));
        motionWidth.set(currentX === 0 ? width : 0);
      }}
      scale="large"
      icon="ChevronsRight"
      label="Toggle Feature Bar"
      className="z-30 fixed bottom-2 left-2 shadow-2xl"
    />
  );
};
