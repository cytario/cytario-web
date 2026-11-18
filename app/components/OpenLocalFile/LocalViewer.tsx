import { useRef } from "react";

import { ImageCanvas } from "../.client/ImageViewer/components/canvas/ImageCanvas";
import { ImageSidebar } from "../.client/ImageViewer/components/sidebar/ImageSidebar";
import { ViewerStoreProvider } from "../.client/ImageViewer/state/store/core/ViewerStoreContext";
import { takeLocalSource } from "~/components/OpenLocalFile/localSourceHolder";
import { useCurrentUser } from "~/hooks/useCurrentUser";

/**
 * The full-bleed viewer mount for a locally-opened file: same canvas and
 * sidebar chrome as the bucket viewer, registered against the held File so
 * no connection, credential, or sidecar sync is ever involved.
 */
export function LocalViewer({ fileName }: { fileName: string }) {
  const user = useCurrentUser();
  const boundsRef = useRef<HTMLDivElement>(null);
  // The held source is read once per name — a re-pick of the same name
  // replaces it before navigating here.
  const source = takeLocalSource(fileName);

  if (!fileName || !source) {
    return (
      <div
        data-theme="dark"
        className="h-full flex items-center justify-center bg-background text-muted-foreground"
      >
        No local file to display — pick a file with the Open local file action.
      </div>
    );
  }

  return (
    <ViewerStoreProvider
      resourceId={`local/${fileName}`}
      signedFetch={null}
      userId={user?.sub ?? ""}
      localSource={source}
    >
      <div
        ref={boundsRef}
        data-theme="dark"
        className="relative flex grow h-full bg-background text-foreground overflow-clip"
      >
        <ImageCanvas />
        <ImageSidebar boundsRef={boundsRef} />
      </div>
    </ViewerStoreProvider>
  );
}
