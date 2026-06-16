import { SIDEBAR_SEARCH_INPUT_ID } from "./SidebarSearchInput";
import { Sidebar, SIDEBAR } from "../Sidebar";
import { useNavSidebarStore } from "../sidebarStores";
import { FeatureItemConnections } from "./FeatureItem.Connections";
import { FeatureItemFavorites } from "./FeatureItem.Favorites";
import { FeatureItemRecent } from "./FeatureItem.Recent";

export function ExplorerSidebar() {
  return (
    <Sidebar
      name={SIDEBAR.nav}
      side="left"
      store={useNavSidebarStore}
      toggleShortcut="mod+b"
      onOpen={() => document.getElementById(SIDEBAR_SEARCH_INPUT_ID)?.focus()}
    >
      <FeatureItemConnections />
      <FeatureItemFavorites />
      <FeatureItemRecent />
    </Sidebar>
  );
}
