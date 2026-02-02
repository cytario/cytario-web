import { select } from "../state/selectors";
import { useViewerStore } from "../state/ViewerStoreContext";
import { PresetLabel } from "./FeatureBar/Presets";
import { Button } from "~/components/Controls";
import { Tooltip } from "~/components/Tooltip/Tooltip";

export const SplitViewToggle = () => {
  const imagePanels = useViewerStore((state) => state.imagePanels);
  const addImagePanel = useViewerStore(select.addImagePanel);
  const removeChannelsState = useViewerStore(select.removeImagePanel);
  const activeImagePanelId = useViewerStore(select.activeImagePanelId);

  const isSplitViewEnabled = imagePanels.length > 1;

  return (
    <Tooltip
      content={isSplitViewEnabled ? "Disable Split View" : "Enable Split View"}
    >
      <Button
        onClick={() => {
          if (imagePanels.length === 1) {
            addImagePanel();
          } else {
            removeChannelsState(imagePanels.length - 1);
          }
        }}
        className={`
          p-0
          gap-0.5
          w-14
          flex
        `}
      >
        {imagePanels.map((i, index) => {
          return (
            <div
              key={index}
              className={`
          
          flex grow h-full w-2 
          transition-colors
          ${activeImagePanelId === index ? "opacity-100" : "opacity-30"}
          
          `}
            >
              <PresetLabel index={i} />
            </div>
          );
        })}
      </Button>
    </Tooltip>
  );
};
