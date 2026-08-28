import { ImageCanvas } from "./canvas/ImageCanvas";
import { ImageSidebar } from "./sidebar/ImageSidebar";
import { ViewerStoreProvider } from "../state/store/ViewerStoreContext";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import type { SignedFetch } from "~/utils/signedFetch";

interface ViewerProps {
  resourceId: string;
  signedFetch: SignedFetch;
}

export const ImageViewer = ({ signedFetch, resourceId }: ViewerProps) => {
  const userId = useCurrentUser()?.sub ?? "";

  return (
    <ViewerStoreProvider resourceId={resourceId} signedFetch={signedFetch} userId={userId}>
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
