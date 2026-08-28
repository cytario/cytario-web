import { ImagePanel } from "./Image/ImagePanel";
import { AnnotationsTools } from "./panels/AnnotationsPanel/AnnotationsTools";
import { useViewerStore } from "../state/store/ViewerStoreContext";

export const ImagePanels = () => {
  const imagePanels = useViewerStore((state) => state.imagePanels);

  return (
    <div className="relative flex w-full h-full">
      <AnnotationsTools />

      {imagePanels.map((_, index) => (
        <ImagePanel key={index} imagePanelId={index} />
      ))}
    </div>
  );
};
