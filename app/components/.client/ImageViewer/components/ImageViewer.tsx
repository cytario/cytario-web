import { FeatureBar } from "./FeatureBar/FeatureBar";
import { ImagePanels } from "./ImagePanels";
import { Magnifier } from "./Magnifier";
import { ViewerHeader } from "./ViewerHeader";
import { ViewerStoreProvider } from "../state/store/ViewerStoreContext";
import type { SignedFetch } from "~/utils/signedFetch";

interface ViewerProps {
  url: string;
  signedFetch: SignedFetch;
}

export const Viewer = ({ url, signedFetch }: ViewerProps) => {
  return (
    <ViewerStoreProvider url={url} signedFetch={signedFetch}>
      <ViewerHeader>
        {({ metadata, viewStateActive, setViewStateActive }) => (
          <Magnifier
            metadata={metadata}
            viewStateActive={viewStateActive}
            setViewStateActive={setViewStateActive}
          />
        )}
      </ViewerHeader>

      <div
        data-theme="dark"
        className="relative flex grow h-full bg-neutral-950 text-(--color-text-primary) overflow-hidden"
      >
        <FeatureBar />
        <ImagePanels />
      </div>
    </ViewerStoreProvider>
  );
};
