import { Sidebar } from "../Sidebar";
import { useNavSidebarStore } from "../sidebarStores";
import { ConnectionsSection } from "./ConnectionsSection/ConnectionsSection";
import { FavoritesSection } from "./FavoritesSection/FavoritesSection";
import { PluginNavSection } from "./PluginNavSection";
import { RecentSection } from "./RecentSection/RecentSection";

export const EXPLORER_SIDEBAR_NAME = "Navigation";

export function ExplorerSidebar() {
  return (
    <Sidebar
      name={EXPLORER_SIDEBAR_NAME}
      side="left"
      store={useNavSidebarStore}
      toggleShortcut="mod+b"
      onOpen={() => document.getElementById("sidebar-search-input")?.focus()}
    >
      <ConnectionsSection />
      <PluginNavSection />
      <FavoritesSection />
      <RecentSection />
    </Sidebar>
  );
}
