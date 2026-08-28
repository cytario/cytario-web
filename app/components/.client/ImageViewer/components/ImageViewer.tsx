import { ImageCanvas } from "./canvas/ImageCanvas";
import { useInitializeChannels } from "./canvas/useInitializeChannels";
import { ImageSidebar } from "./sidebar/ImageSidebar";
import { ViewerStoreProvider } from "../state/store/ViewerStoreContext";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import type { SignedFetch } from "~/utils/signedFetch";

interface ViewerProps {
  resourceId: string;
  signedFetch: SignedFetch;
}

function ChannelInitializer() {
  useInitializeChannels();
  return null;
}

export const ImageViewer = ({ signedFetch, resourceId }: ViewerProps) => {
  const userId = useCurrentUser()?.sub ?? "";

  return (
    <ViewerStoreProvider resourceId={resourceId} signedFetch={signedFetch} userId={userId}>
      <ChannelInitializer />
      <div
        data-theme="dark"
        className="relative flex grow h-full bg-background text-foreground overflow-clip"
      >
        <ImageCanvas />
        <ImageSidebar />
      </div>
    </ViewerStoreProvider>
  );
};
