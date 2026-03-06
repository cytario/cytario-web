import { IconButton } from "@cytario/design";
import { ChevronsRight } from "lucide-react";
import { MotionValue } from "motion/react";

import { useFeatureBarStore } from "./useFeatureBar";

export const FeatureBarToggle = ({
  motionWidth,
}: {
  motionWidth: MotionValue<number>;
}) => {
  const { minWidth, setWidth, width } = useFeatureBarStore();

  return (
    <IconButton
      onPress={() => {
        if (motionWidth.isAnimating()) motionWidth.stop();
        const currentX = motionWidth.get();
        setWidth(Math.max(currentX, minWidth));
        motionWidth.set(currentX === 0 ? width : 0);
      }}
      size="lg"
      icon={ChevronsRight}
      aria-label="Toggle Feature Bar"
      className="z-30 fixed bottom-2 left-2 shadow-2xl"
    />
  );
};
