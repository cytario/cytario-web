import { IconButtonToggle } from "@cytario/design";

import { AnnotationsPanel } from "./AnnotationsPanel/AnnotationsPanel";
import { ChannelsPanel } from "./ChannelsPanel/ChannelsPanel";
import { ImagePreview } from "./Image/ImagePreview";
import { ImagePanels } from "./ImagePanels";
import { Magnifier } from "./Magnifier";
import { OverlaysPanel } from "./OverlaysPanel/OverlaysPanel";
import { Presets } from "./Presets/Presets";
import { ViewerHeader } from "./ViewerHeader";
import { ViewerStoreProvider } from "../state/store/ViewerStoreContext";
import { createSidebarStore } from "~/components/Sidebar/createSidebarStore";
import { Sidebar, SIDEBAR, sidebarDomId, sidebarToggleId } from "~/components/Sidebar/Sidebar";
import type { SignedFetch } from "~/utils/signedFetch";

interface ViewerProps {
  resourceId: string;
  signedFetch: SignedFetch;
}

export const useViewerSidebarStore = createSidebarStore({ name: "ViewerSidebar" });

export const Viewer = ({ signedFetch, resourceId }: ViewerProps) => {
  return (
    <ViewerStoreProvider resourceId={resourceId} signedFetch={signedFetch}>
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
        className="relative flex grow h-full bg-background text-foreground overflow-hidden"
      >
        <ImagePanels />
        <Sidebar
          name={SIDEBAR.viewer}
          side="right"
          store={useViewerSidebarStore}
          toggleShortcut="mod+alt+b"
          openOnMount
        >
          <Presets>
            <div className="block h-60 w-full shrink-0">
              <ImagePreview isInteractive />
            </div>
            <ChannelsPanel />
            <OverlaysPanel />
            <AnnotationsPanel />
          </Presets>
        </Sidebar>
        <ViewerSidebarToggle />
      </div>
    </ViewerStoreProvider>
  );
};

// Always-visible toggle (bottom-right) so the panel can be reopened when collapsed.
function ViewerSidebarToggle() {
  const isOpen = useViewerSidebarStore((s) => s.isOpen);
  const toggle = useViewerSidebarStore((s) => s.toggle);
  return (
    <div data-theme="dark" className="absolute right-2 bottom-2 z-40">
      <IconButtonToggle
        id={sidebarToggleId(SIDEBAR.viewer)}
        icon={isOpen ? "PanelRightClose" : "PanelRightOpen"}
        label="Toggle image controls"
        aria-controls={sidebarDomId(SIDEBAR.viewer)}
        aria-expanded={isOpen}
        variant="ghost"
        isSelected={isOpen}
        onChange={toggle}
      />
    </div>
  );
}
