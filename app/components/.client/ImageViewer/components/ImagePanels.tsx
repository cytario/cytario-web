import { select } from "../state/selectors";
import { useViewerStore } from "../state/ViewerStoreContext";
import { ImagePanel } from "./Image/ImagePanel";
import { Magnifier } from "./Magnifier";

export const ImagePanels = () => {
  const imagePanels = useViewerStore((state) => state.imagePanels);

  const metadata = useViewerStore(select.metadata);
  const viewStateActive = useViewerStore(select.viewStateActive);
  const setViewStateActive = useViewerStore(select.setViewStateActive);

  return (
    <div className="flex flex-col w-full">
      <div className="flex justify-end xl:hidden p-2 pt-0">
        <Magnifier
          metadata={metadata}
          viewStateActive={viewStateActive}
          setViewStateActive={setViewStateActive}
        />
      </div>
      <div className="flex w-full h-full">
        {imagePanels.map((_, index) => (
          <ImagePanel key={index} imagePanelId={index} />
        ))}
      </div>
    </div>
  );
};
