import { Button } from "@cytario/design";

import { select } from "../state/selectors";
import { useViewerStore } from "../state/ViewerStoreContext";
import { rgb } from "./ChannelsController/ColorPicker";
import { Tooltip } from "~/components/Tooltip/Tooltip";

const emptyObj = {};

export const SplitViewToggle = () => {
  const imagePanels = useViewerStore((state) => state.imagePanels);
  const addImagePanel = useViewerStore(select.addImagePanel);
  const removeChannelsState = useViewerStore(select.removeImagePanel);
  const activeImagePanelId = useViewerStore(select.activeImagePanelId);
  const layersStates = useViewerStore(select.layersStates);

  const isSplitViewEnabled = imagePanels.length > 1;

  return (
    <Tooltip
      content={isSplitViewEnabled ? "Disable Split View" : "Enable Split View"}
    >
      <Button
        onPress={() => {
          if (imagePanels.length === 1) {
            addImagePanel();
          } else {
            removeChannelsState(imagePanels.length - 1);
          }
        }}
        className={`
          p-0
          gap-0.5
          w-14 h-8
          flex
        `}
      >
        {imagePanels.map((i, index) => {
          const layersState = layersStates[i];
          const opacity = layersState?.channelsOpacity ?? 1;
          const colors = Object.entries(layersState?.channels ?? emptyObj)
            .filter(([, { isVisible }]) => isVisible)
            .map(([, config]) => rgb(config.color, opacity));

          const background =
            colors.length > 0
              ? `linear-gradient(-45deg, ${colors.join(", ")})`
              : "var(--color-surface-muted)";

          return (
            <div
              key={index}
              className={`
                flex items-center justify-center grow h-full w-2
                rounded-sm overflow-hidden
                text-[10px] font-bold
                border transition-all
                ${activeImagePanelId === index ? "border-[var(--color-border-focus)] ring-1 ring-[var(--color-border-focus)] ring-offset-1 ring-offset-[var(--color-surface-default)]" : "border-[var(--color-border-strong)]"}
              `}
              style={{ background }}
            >
              {index + 1}
            </div>
          );
        })}
      </Button>
    </Tooltip>
  );
};
