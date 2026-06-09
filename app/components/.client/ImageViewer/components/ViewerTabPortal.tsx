import { useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";

import { ChannelsController } from "./ChannelsController/ChannelsController";
import { Presets } from "./FeatureBar/Presets";
import { ImagePreview } from "./Image/ImagePreview";
import { OverlaysController } from "./OverlaysController/OverlaysController";
import { useLayoutStore } from "~/components/DirectoryView/useLayoutStore";
import { SIDEBAR_VIEWER_OUTLET_ID } from "~/components/Sidebar/Viewer/SidebarViewerOutlet";

// Lifts the FeatureBar body into the sidebar's Viewer tab. Rendered inside
// ViewerStoreProvider so the controls keep their viewer-store access; portaled
// into the layout-level outlet (located by id) so they live in the sidebar.
export function ViewerTabPortal() {
  const setActive = useLayoutStore((s) => s.setViewerTabActive);
  const setTab = useLayoutStore((s) => s.setSidebarTab);
  const active = useLayoutStore((s) => s.viewerTabActive);
  const [outlet, setOutlet] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setActive(true);
    setTab("viewer");
    return () => setActive(false);
  }, [setActive, setTab]);

  // The outlet mounts once the sidebar reacts to `active`; grab the node by id.
  // Imperative DOM capture is the point of this layout effect.
  useLayoutEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOutlet(active ? document.getElementById(SIDEBAR_VIEWER_OUTLET_ID) : null);
  }, [active]);

  if (!outlet) return null;

  return createPortal(
    <Presets>
      <div className="block h-60 w-full shrink-0">
        <ImagePreview isInteractive />
      </div>
      <ChannelsController />
      <OverlaysController />
    </Presets>,
    outlet,
  );
}
