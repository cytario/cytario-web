import { FeatureBar } from "./FeatureBar/FeatureBar";
import { ImagePanels } from "./ImagePanels";
import { Magnifier } from "./Magnifier";
import { ViewerHeader } from "./ViewerHeader";
import { ViewerStoreProvider } from "../state/ViewerStoreContext";

interface ViewerProps {
  resourceId: string;
  url: string;
}

export const Viewer = ({ resourceId, url }: ViewerProps) => {
  return (
    <ViewerStoreProvider resourceId={resourceId} url={url}>
      <ViewerHeader>
        {({ metadata, viewStateActive, setViewStateActive }) => (
          <Magnifier
            metadata={metadata}
            viewStateActive={viewStateActive}
            setViewStateActive={setViewStateActive}
          />
        )}
      </ViewerHeader>

      <main className="relative flex flex-grow bg-slate-950 text-white overflow-hidden">
        <FeatureBar />
        <ImagePanels />
      </main>
    </ViewerStoreProvider>
  );
};
