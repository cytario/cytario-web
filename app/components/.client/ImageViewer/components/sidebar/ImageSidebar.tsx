import type { ComponentType, RefObject } from "react";

import { useViewerSidebarStore } from "../useViewerSidebarStore";
import { AnnotationsSection } from "./AnnotationsSection/AnnotationsSection";
import { ChannelsSection } from "./ChannelsSection/ChannelsSection";
import { ImageSidebarToggle } from "./ImageSidebarToggle";
import { OverlaysSection } from "./OverlaysSection/OverlaysSection";
import { OverviewSection } from "./OverviewSection/OverviewSection";
import { ViewsSection } from "./ViewsSection/ViewsSection";
import { Sidebar } from "~/components/Sidebar/Sidebar";
import type { PillarId } from "~/utils/pillars";

export const IMAGE_SIDEBAR_NAME = "Image Controls";

/** Render order in the sidebar; a docked section always returns to its slot here. */
const SECTIONS: { pillar: PillarId; Component: ComponentType }[] = [
  { pillar: "overview", Component: OverviewSection },
  { pillar: "views", Component: ViewsSection },
  { pillar: "channels", Component: ChannelsSection },
  { pillar: "overlays", Component: OverlaysSection },
  { pillar: "annotations", Component: AnnotationsSection },
];

interface ImageSidebarProps {
  /** Box floated sections are spawned inside — the viewer's canvas area. */
  boundsRef: RefObject<HTMLElement | null>;
}

/** Viewer controls sidebar: overview, views, channels, overlays, annotations. */
export const ImageSidebar = ({ boundsRef }: ImageSidebarProps) => (
  <>
    <Sidebar
      name={IMAGE_SIDEBAR_NAME}
      side="right"
      store={useViewerSidebarStore}
      toggleShortcut="mod+shift+b"
      openOnMount
      floatable
      boundsRef={boundsRef}
    >
      {SECTIONS.map(({ pillar, Component }) => (
        <Component key={pillar} />
      ))}
    </Sidebar>
    <ImageSidebarToggle />
  </>
);
