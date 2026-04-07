import { addDecoder } from "geotiff";

import { FeatureBar } from "./FeatureBar/FeatureBar";
import { ImagePanels } from "./ImagePanels";
import { Magnifier } from "./Magnifier";
import { ViewerHeader } from "./ViewerHeader";
import { JP2KDecoder } from "../state/decoders/jp2k-decoder";
import { LZWDecoder } from "../state/decoders/lzwDecoder";
import { ViewerStoreProvider } from "../state/store/ViewerStoreContext";
import type { SignedFetch } from "~/utils/signedFetch";

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
