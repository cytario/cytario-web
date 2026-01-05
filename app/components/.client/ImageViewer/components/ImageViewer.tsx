import type { Credentials } from "@aws-sdk/client-sts";

import { FeatureBar } from "./FeatureBar/FeatureBar";
import { ImagePanels } from "./ImagePanels";
import { Magnifier } from "./Magnifier";
import { ViewerHeader } from "./ViewerHeader";
import { ViewerStoreProvider } from "../state/ViewerStoreContext";
import type { ClientBucketConfig } from "~/utils/credentialsStore/useCredentialsStore";

interface ViewerProps {
  resourceId: string;
  url: string;
  credentials?: Credentials;
  bucketConfig?: ClientBucketConfig;
}

export const Viewer = ({
  resourceId,
  url,
  credentials,
  bucketConfig,
}: ViewerProps) => {
  return (
    <ViewerStoreProvider
      resourceId={resourceId}
      url={url}
      credentials={credentials}
      bucketConfig={bucketConfig}
    >
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
