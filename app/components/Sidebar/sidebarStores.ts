import { createSidebarStore } from "./createSidebarStore";

// Left: connection navigation (Explorer). Present on every route.
export const useNavSidebarStore = createSidebarStore({ name: "NavSidebar" });

// Right: image controls (channels/overlays/presets). Viewer routes only,
// open by default so controls are visible on arrival.
export const useViewerSidebarStore = createSidebarStore({ name: "ViewerSidebar" });
