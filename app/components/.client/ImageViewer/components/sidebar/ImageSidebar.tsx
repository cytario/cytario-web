import { useViewerSidebarStore } from "../ImageViewer";
import { AnnotationsControl } from "./AnnotationsControl/AnnotationsControl";
import { ChannelsControl } from "./ChannelsControl/ChannelsControl";
import { OverlaysControl } from "./OverlaysControl/OverlaysControl";
import { OverviewControl } from "./OverviewControl/OverviewControl";
import { SidebarToggle } from "./SidebarToggle";
import { ViewsControl } from "./ViewsControl/ViewsControl";
import { Sidebar, SIDEBAR } from "~/components/Sidebar/Sidebar";

/** Viewer controls sidebar: overview, views, channels, overlays, annotations. */
export const ImageSidebar = () => (
  <>
    <Sidebar
      name={SIDEBAR.viewer}
      side="right"
      store={useViewerSidebarStore}
      toggleShortcut="mod+alt+b"
      openOnMount
    >
      <OverviewControl />
      <ViewsControl />
      <ChannelsControl />
      <OverlaysControl />
      <AnnotationsControl />
    </Sidebar>
    <SidebarToggle />
  </>
);
