import { SpatialDataCanvas } from "./SpatialDataCanvas";
import { SpatialDataSidebar } from "./SpatialDataSidebar";
import { SpatialDataStoreProvider } from "../state/SpatialDataStoreContext";
import type { SignedFetch } from "~/utils/signedFetch";

interface SpatialDataViewerProps {
  resourceId: string;
  signedFetch: SignedFetch;
}

export const SpatialDataViewer = ({ resourceId, signedFetch }: SpatialDataViewerProps) => (
  <SpatialDataStoreProvider resourceId={resourceId} signedFetch={signedFetch}>
    <div
      data-theme="dark"
      className="relative flex grow h-full bg-background text-foreground overflow-clip"
    >
      <SpatialDataCanvas />
      <SpatialDataSidebar />
    </div>
  </SpatialDataStoreProvider>
);
