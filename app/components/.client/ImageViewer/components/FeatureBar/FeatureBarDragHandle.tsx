import { motion, MotionValue } from "motion/react";

import { useFeatureBarStore } from "./useFeatureBar";

export const FeatureBarDragHandle = ({
  motionWidth,
}: {
  motionWidth: MotionValue<number>;
}) => {
  const { minWidth, maxWidth } = useFeatureBarStore();

  return (
    <motion.button
      drag="x"
      dragMomentum={false}
      className={`
          cursor-ew-resize absolute top-0 left-0.5 h-full w-4
          bg-transparent
          hover:bg-[var(--color-surface-overlay)]
          duration-100
          z-10
        `}
      dragConstraints={{ left: 0, right: maxWidth }}
      style={{ x: motionWidth }}
      dragTransition={{
        timeConstant: 50,
        modifyTarget: (target) => {
          if (target < minWidth / 2) return 0;
          return Math.max(minWidth, target);
        },
      }}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize Feature Bar"
    />
  );
};
