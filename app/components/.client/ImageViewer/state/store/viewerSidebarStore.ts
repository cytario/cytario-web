import { createSidebarStore } from "~/components/Sidebar/createSidebarStore";

// The viewer's right-edge controls panel (channels/overlays/presets). Owned by
// the viewer module — alongside the viewer store registry — so the viewer stays
// a self-contained client module rather than reaching into app-shell sidebar
// state. Forced open on viewer arrival (see Sidebar `openOnMount`).
export const useViewerSidebarStore = createSidebarStore({ name: "ViewerSidebar" });
