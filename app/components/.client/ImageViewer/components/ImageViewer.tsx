import { IconButton } from "@cytario/design";
import { PanelRight } from "lucide-react";

import { ImagePanels } from "./ImagePanels";
import { Magnifier } from "./Magnifier";
import { ViewerHeader } from "./ViewerHeader";
import { ViewerSidebar } from "./ViewerSidebar";
import { ViewerStoreProvider } from "../state/store/ViewerStoreContext";
import { useViewerSidebarStore } from "~/components/Sidebar/sidebarStores";
import type { SignedFetch } from "~/utils/signedFetch";

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
        <ImagePanels />
        <ViewerSidebar />
        <ViewerSidebarToggle />
      </div>
    </ViewerStoreProvider>
  );
};

// Always-visible toggle (top-right) so the panel can be reopened when collapsed.
function ViewerSidebarToggle() {
  const isOpen = useViewerSidebarStore((s) => s.isOpen);
  const toggle = useViewerSidebarStore((s) => s.toggle);
  return (
    <div data-theme="dark" className="absolute right-2 bottom-2 z-40">
      <IconButton
        id="viewer-panel-toggle"
        icon={PanelRight}
        aria-label="Toggle image controls"
        aria-expanded={isOpen}
        aria-controls="viewer-sidebar"
        variant={isOpen ? "primary" : "ghost"}
        onPress={toggle}
      />
    </div>
  );
}
