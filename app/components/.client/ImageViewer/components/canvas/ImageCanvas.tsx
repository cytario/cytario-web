import { ImagePanel } from "./ImagePanel";
import { useViewerStore } from "../../state/store/ViewerStoreContext";
import { Toolbar } from "../Toolbar";

/** Canvas area: renders N ImagePanels + floating Toolbar. */
export const ImageCanvas = () => {
  const imagePanels = useViewerStore((state) => state.imagePanels);

  return (
    <div className="relative flex w-full h-full">
      {imagePanels.map((_, index) => (
        <ImagePanel key={index} imagePanelId={index} />
      ))}

      <Toolbar />
    </div>
  );
};
