import { ImagePanel } from "./Image/ImagePanel";
import { useViewerStore } from "../state/store/ViewerStoreContext";

export const ImagePanels = () => {
  const imagePanels = useViewerStore((state) => state.imagePanels);

  return (
    <div className="flex flex-col w-full">
      <div className="flex w-full h-full">
        {imagePanels.map((_, index) => (
          <ImagePanel key={index} imagePanelId={index} />
        ))}
      </div>
    </div>
  );
};
