import { Button, Tooltip } from "@cytario/design";

import { rgb } from "./ChannelsController/ColorPicker/ColorPicker";
import { select } from "../state/store/selectors";
import { useViewerStore } from "../state/store/ViewerStoreContext";

const emptyObj = {};

export const SplitViewToggle = () => {
  const imagePanels = useViewerStore((state) => state.imagePanels);
  const addImagePanel = useViewerStore(select.addImagePanel);
  const removeChannelsState = useViewerStore(select.removeImagePanel);
  const activeImagePanelId = useViewerStore(select.activeImagePanelId);
  const layersStates = useViewerStore(select.layersStates);

  const isSplitViewEnabled = imagePanels.length > 1;

  return (
    <Tooltip content={isSplitViewEnabled ? "Disable Split View" : "Enable Split View"}>
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
              : "var(--color-muted)";

          return (
            <div
              key={index}
              className={`
                flex items-center justify-center grow h-full w-2
                rounded-sm overflow-hidden
                text-[10px] font-bold
                border transition-all
                ${activeImagePanelId === index ? "border-ring ring-1 ring-ring ring-offset-1 ring-offset-background" : "border-border"}
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
