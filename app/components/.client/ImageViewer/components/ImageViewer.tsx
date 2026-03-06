import { addDecoder } from "geotiff";

import { FeatureBar } from "./FeatureBar/FeatureBar";
import { ImagePanels } from "./ImagePanels";
import { Magnifier } from "./Magnifier";
import { ViewerHeader } from "./ViewerHeader";
import { JP2KDecoder } from "../state/jp2k-decoder";
import { LZWDecoder } from "../state/lzwDecoder";
import { ViewerStoreProvider } from "../state/ViewerStoreContext";

/**
 * Register decoders for GeoTIFF files.
 * Must run client-side only — decoders use Web Workers.
 * Guarded to prevent duplicate registration during HMR.
 * @url https://github.com/vitessce/vitessce/issues/1709#issuecomment-2960537868
 */
let decodersRegistered = false;
if (!decodersRegistered) {
  addDecoder(5, () => LZWDecoder);
  addDecoder(33005, () => JP2KDecoder);
  decodersRegistered = true;
}

interface ViewerProps {
  resourceId: string;
  url: string;
  offsetsUrl?: string;
}

export const Viewer = ({ resourceId, url, offsetsUrl }: ViewerProps) => {
  return (
    <ViewerStoreProvider resourceId={resourceId} url={url} offsetsUrl={offsetsUrl}>
      <ViewerHeader>
        {({ metadata, viewStateActive, setViewStateActive }) => (
          <Magnifier
            metadata={metadata}
            viewStateActive={viewStateActive}
            setViewStateActive={setViewStateActive}
          />
        )}
      </ViewerHeader>

      <div data-theme="dark" className="relative flex flex-grow h-full bg-[var(--color-neutral-950)] text-[var(--color-text-primary)] overflow-hidden">
        <FeatureBar />
        <ImagePanels />
      </div>
    </ViewerStoreProvider>
  );
};
