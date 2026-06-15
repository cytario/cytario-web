import { ImagePanel } from "./Image/ImagePanel";
import { Magnifier } from "./Magnifier";
import { select } from "../state/store/selectors";
import { useClearSharedView } from "../state/store/useClearSharedView";
import { useViewerStore } from "../state/store/ViewerStoreContext";

export const ImagePanels = () => {
  const imagePanels = useViewerStore((state) => state.imagePanels);

  const metadata = useViewerStore(select.metadata);
  const viewStateActive = useViewerStore(select.viewStateActive);
  const viewStateUrl = useViewerStore(select.viewStateUrl);
  const setViewStateActive = useViewerStore(select.setViewStateActive);
  const clearSharedView = useClearSharedView();

  return (
    <div className="flex flex-col w-full">
      <div className="flex justify-end xl:hidden p-2 pt-0">
        <Magnifier
          metadata={metadata}
          viewStateActive={viewStateActive}
          viewStateUrl={viewStateUrl}
          setViewStateActive={setViewStateActive}
          clearSharedView={clearSharedView}
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
