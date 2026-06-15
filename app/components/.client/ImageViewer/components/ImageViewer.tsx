import { IconButton } from "@cytario/design";
import { PanelRightClose, PanelRightOpen } from "lucide-react";

import { ChannelsController } from "./ChannelsController/ChannelsController";
import { ImagePreview } from "./Image/ImagePreview";
import { ImagePanels } from "./ImagePanels";
import { Magnifier } from "./Magnifier";
import { OverlaysController } from "./OverlaysController/OverlaysController";
import { Presets } from "./Presets/Presets";
import { ViewerHeader } from "./ViewerHeader";
import { useViewerSidebarStore } from "../state/store/viewerSidebarStore";
import { ViewerStoreProvider } from "../state/store/ViewerStoreContext";
import {
  Sidebar,
  SIDEBAR,
  SIDEBAR_TOGGLE_ACTIVE_CLASS,
  sidebarDomId,
  sidebarToggleId,
} from "~/components/Sidebar/Sidebar";
import type { SignedFetch } from "~/utils/signedFetch";

interface ViewerProps {
  url: string;
  signedFetch: SignedFetch;
}

export const Viewer = ({ url, signedFetch }: ViewerProps) => {
  return (
    <ViewerStoreProvider url={url} signedFetch={signedFetch}>
      <ViewerHeader>
        {({ metadata, viewStateActive, viewStateUrl, setViewStateActive, clearSharedView }) => (
          <Magnifier
            metadata={metadata}
            viewStateActive={viewStateActive}
            viewStateUrl={viewStateUrl}
            setViewStateActive={setViewStateActive}
            clearSharedView={clearSharedView}
          />
        )}
      </ViewerHeader>

      <div
        data-theme="dark"
        className="relative flex grow h-full bg-(--color-slate-950) text-(--color-text-primary) overflow-hidden"
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
        icon={isOpen ? PanelRightClose : PanelRightOpen}
        aria-label="Toggle image controls"
        aria-expanded={isOpen}
        aria-controls={sidebarDomId(SIDEBAR.viewer)}
        variant="ghost"
        className={isOpen ? SIDEBAR_TOGGLE_ACTIVE_CLASS : undefined}
        onPress={toggle}
      />
    </div>
  );
}
