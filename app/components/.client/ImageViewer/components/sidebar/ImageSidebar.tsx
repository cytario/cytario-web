import { useViewerSidebarStore } from "../useViewerSidebarStore";
import { AnnotationsSection } from "./AnnotationsSection/AnnotationsSection";
import { ChannelsSection } from "./ChannelsSection/ChannelsSection";
import { ImageSidebarToggle } from "./ImageSidebarToggle";
import { OverlaysSection } from "./OverlaysSection/OverlaysSection";
import { OverviewSection } from "./OverviewSection/OverviewSection";
import { ViewsSection } from "./ViewsSection/ViewsSection";
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
      <OverviewSection />
      <ViewsSection />
      <ChannelsSection />
      <OverlaysSection />
      <AnnotationsSection />
    </Sidebar>
    <ImageSidebarToggle />
  </>
);
