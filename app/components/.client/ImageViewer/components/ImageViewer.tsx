import { IconButton } from "@cytario/design";

import { AnnotationsController } from "./AnnotationsController/AnnotationsController";
import { ChannelsController } from "./ChannelsController/ChannelsController";
import { AnnotationsSync } from "./Image/Annotations/AnnotationsSync";
import { ImagePreview } from "./Image/ImagePreview";
import { ImagePanels } from "./ImagePanels";
import { Magnifier } from "./Magnifier";
import { OverlaysController } from "./OverlaysController/OverlaysController";
import { Presets } from "./Presets/Presets";
import { ViewerHeader } from "./ViewerHeader";
import { ViewerStoreProvider } from "../state/store/ViewerStoreContext";
import { createSidebarStore } from "~/components/Sidebar/createSidebarStore";
import {
  Sidebar,
  SIDEBAR,
  SIDEBAR_TOGGLE_ACTIVE_CLASS,
  sidebarDomId,
  sidebarToggleId,
} from "~/components/Sidebar/Sidebar";
import type { SignedFetch } from "~/utils/signedFetch";

interface ViewerProps {
  resourceId: string;
  signedFetch: SignedFetch;
}

export const useViewerSidebarStore = createSidebarStore({ name: "ViewerSidebar" });

export const Viewer = ({ signedFetch, resourceId }: ViewerProps) => {
  return (
    <ViewerStoreProvider resourceId={resourceId} signedFetch={signedFetch}>
      <AnnotationsSync />
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
            <ChannelsController />
            <OverlaysController />
            <AnnotationsController />
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
      <IconButton
        id={sidebarToggleId(SIDEBAR.viewer)}
        icon={isOpen ? "PanelRightClose" : "PanelRightOpen"}
        label="Toggle image controls"
        aria-expanded={isOpen}
        aria-controls={sidebarDomId(SIDEBAR.viewer)}
        variant="ghost"
        className={isOpen ? SIDEBAR_TOGGLE_ACTIVE_CLASS : undefined}
        onPress={toggle}
      />
    </div>
  );
}
