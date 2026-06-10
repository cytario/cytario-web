import { createSidebarStore } from "./createSidebarStore";

// Left: connection navigation (Explorer). App-shell domain, present on every
// route. The viewer's sidebar store lives in the viewer module (it owns it).
export const useNavSidebarStore = createSidebarStore({ name: "NavSidebar" });
