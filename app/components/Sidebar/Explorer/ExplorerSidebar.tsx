import { Sidebar } from "../Sidebar";
import { useNavSidebarStore } from "../sidebarStores";
import { FeatureItemConnections } from "./FeatureItem.Connections";
import { FeatureItemFavorites } from "./FeatureItem.Favorites";
import { FeatureItemRecent } from "./FeatureItem.Recent";
import { PluginNavSection } from "./PluginNavSection";

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
      <FeatureItemConnections />
      <PluginNavSection />
      <FeatureItemFavorites />
      <FeatureItemRecent />
    </Sidebar>
  );
}
