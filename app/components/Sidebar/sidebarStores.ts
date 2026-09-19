import { createSidebarStore } from "./createSidebarStore";

// App-shell sidebar store; the viewer has its own, owned by the viewer module.
export const useNavSidebarStore = createSidebarStore({ name: "NavSidebar" });
