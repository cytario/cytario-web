import { ImagePanel } from "./canvas/ImagePanel";
import { Toolbar } from "./Toolbar";
import { useViewerStore } from "../state/store/ViewerStoreContext";

export const ImagePanels = () => {
  const imagePanels = useViewerStore((state) => state.imagePanels);

  return (
    <div className="relative flex w-full h-full">
      <Toolbar />

      {imagePanels.map((_, index) => (
        <ImagePanel key={index} imagePanelId={index} />
      ))}
    </div>
  );
};
