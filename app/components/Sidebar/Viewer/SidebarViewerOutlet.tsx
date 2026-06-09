// Portal target for the open image's viewer controls (channels/overlays).
// Identified by a stable id so <Viewer> can portal into it without putting a
// DOM node into any store.
export const SIDEBAR_VIEWER_OUTLET_ID = "sidebar-viewer-outlet";

export function SidebarViewerOutlet() {
  return <div id={SIDEBAR_VIEWER_OUTLET_ID} data-theme="dark" className="h-full min-h-0" />;
}
