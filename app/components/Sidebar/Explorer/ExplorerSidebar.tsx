import { Sidebar, SIDEBAR } from "../Sidebar";
import { useNavSidebarStore } from "../sidebarStores";
import { FeatureItemConnections } from "./FeatureItem.Connections";
import { FeatureItemFavorites } from "./FeatureItem.Favorites";
import { FeatureItemRecent } from "./FeatureItem.Recent";
import { PluginNavSection } from "./PluginNavSection";

export function ExplorerSidebar() {
  return (
    <Sidebar
      name={SIDEBAR.nav}
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
