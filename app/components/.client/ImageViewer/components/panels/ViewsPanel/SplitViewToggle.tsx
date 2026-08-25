import { Button, Tooltip } from "@cytario/design";

import { channelsStateForPanel, select } from "../../../state/store/selectors";
import { ChannelsState } from "../../../state/store/types";
import { useViewerStore } from "../../../state/store/ViewerStoreContext";
import { rgb } from "../ChannelsPanel/ColorPicker/ColorPicker";

const EMPTY_CHANNELS: ChannelsState = Object.freeze({});

function SplitPanelButton({ panelIndex, isActive }: { panelIndex: number; isActive: boolean }) {
  const channelsState = useViewerStore(channelsStateForPanel(panelIndex)) ?? EMPTY_CHANNELS;
  const channelsOpacity = useViewerStore((state) => {
    const channelsStateIndex = state.imagePanels[panelIndex];
    return state.layersStates[channelsStateIndex]?.channelsOpacity ?? 1;
  });

  const colors = Object.entries(channelsState)
    .filter(([, { isVisible }]) => isVisible)
    .map(([, config]) => rgb(config.color, channelsOpacity));

  const background =
    colors.length > 0 ? `linear-gradient(-45deg, ${colors.join(", ")})` : "var(--color-muted)";

  return (
    <div
      className={`
        flex items-center justify-center grow h-full w-2
        rounded-sm overflow-hidden
        text-[10px] font-bold
        border transition-all
        ${isActive ? "border-ring ring-1 ring-ring ring-offset-1 ring-offset-background" : "border-border"}
      `}
      style={{ background }}
    >
      {panelIndex + 1}
    </div>
  );
}

export const SplitViewToggle = () => {
  const imagePanels = useViewerStore((state) => state.imagePanels);
  const addImagePanel = useViewerStore(select.addImagePanel);
  const removeImagePanel = useViewerStore(select.removeImagePanel);
  const activeImagePanelId = useViewerStore(select.activeImagePanelId);

  const isSplitViewEnabled = imagePanels.length > 1;

  return (
    <Tooltip content={isSplitViewEnabled ? "Disable Split View" : "Enable Split View"}>
      <Button
        onPress={() => {
          if (imagePanels.length === 1) {
            addImagePanel();
          } else {
            removeImagePanel(imagePanels.length - 1);
          }
        }}
        className={`
          p-0
          gap-0.5
          w-14 h-8
          flex
        `}
      >
        {imagePanels.map((_, index) => (
          <SplitPanelButton
            key={index}
            panelIndex={index}
            isActive={activeImagePanelId === index}
          />
        ))}
      </Button>
    </Tooltip>
  );
};
