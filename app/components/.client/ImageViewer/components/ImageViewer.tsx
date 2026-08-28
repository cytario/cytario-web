import { ImageCanvas } from "./canvas/ImageCanvas";
import { useAnnotationModeKeyboard } from "./canvas/useAnnotationModeKeyboard";
import { AnnotationsControl } from "./sidebar/AnnotationsControl/AnnotationsControl";
import { ChannelsControl } from "./sidebar/ChannelsControl/ChannelsControl";
import { OverlaysControl } from "./sidebar/OverlaysControl/OverlaysControl";
import { OverviewControl } from "./sidebar/OverviewControl/OverviewControl";
import { ViewsControl } from "./sidebar/ViewsControl/ViewsControl";
import { SidebarToggle } from "./SidebarToggle";
import { useUndoRedoShortcuts } from "../state/store/useUndoRedoShortcuts";
import { ViewerStoreProvider } from "../state/store/ViewerStoreContext";
import { createSidebarStore } from "~/components/Sidebar/createSidebarStore";
import { Sidebar, SIDEBAR } from "~/components/Sidebar/Sidebar";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import type { SignedFetch } from "~/utils/signedFetch";

interface ViewerProps {
  resourceId: string;
  signedFetch: SignedFetch;
}

export const useViewerSidebarStore = createSidebarStore({ name: "ViewerSidebar" });

export const ImageViewer = ({ signedFetch, resourceId }: ViewerProps) => {
  const userId = useCurrentUser()?.sub ?? "";

  return (
    <ViewerStoreProvider resourceId={resourceId} signedFetch={signedFetch} userId={userId}>
      <UndoRedoShortcuts />
      <AnnotationModeKeyboard />

      <div
        data-theme="dark"
        className="relative flex grow h-full bg-background text-foreground overflow-clip"
      >
        <ImageCanvas />
        <Sidebar
          name={SIDEBAR.viewer}
          side="right"
          store={useViewerSidebarStore}
          toggleShortcut="mod+alt+b"
          openOnMount
        >
          <OverviewControl />
          <ViewsControl />
          <ChannelsControl />
          <OverlaysControl />
          <AnnotationsControl />
        </Sidebar>
        <SidebarToggle />
      </div>
    </ViewerStoreProvider>
  );
};

// Mounts the keyboard shortcut listener inside the ViewerStoreProvider.
function UndoRedoShortcuts() {
  useUndoRedoShortcuts();
  return null;
}

// Mounts the annotation-mode keyboard shortcuts (Esc→view, Space→temp drag)
// inside the ViewerStoreProvider.
function AnnotationModeKeyboard() {
  useAnnotationModeKeyboard();
  return null;
}
