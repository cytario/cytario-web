import { useViewerSidebarStore } from "../useViewerSidebarStore";
import { AnnotationsControl } from "./AnnotationsControl/AnnotationsControl";
import { ChannelsControl } from "./ChannelsControl/ChannelsControl";
import { ImageSidebarToggle } from "./ImageSidebarToggle";
import { OverlaysControl } from "./OverlaysControl/OverlaysControl";
import { OverviewControl } from "./OverviewControl/OverviewControl";
import { ViewsControl } from "./ViewsControl/ViewsControl";
import { Sidebar } from "~/components/Sidebar/Sidebar";

export const IMAGE_SIDEBAR_NAME = "Image Controls";

/** Viewer controls sidebar: overview, views, channels, overlays, annotations. */
export const ImageSidebar = () => (
  <>
    <Sidebar
      name={IMAGE_SIDEBAR_NAME}
      side="right"
      store={useViewerSidebarStore}
      toggleShortcut="mod+shift+b"
      openOnMount
    >
      <OverviewControl />
      <ViewsControl />
      <ChannelsControl />
      <OverlaysControl />
      <AnnotationsControl />
    </Sidebar>
    <ImageSidebarToggle />
  </>
);
