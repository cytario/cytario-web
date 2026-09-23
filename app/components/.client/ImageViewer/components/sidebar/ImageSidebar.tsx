import type { ComponentType, RefObject } from "react";

import { useViewerSidebarStore } from "../useViewerSidebarStore";
import { AnnotationsSection } from "./AnnotationsSection/AnnotationsSection";
import { ChannelsSection } from "./ChannelsSection/ChannelsSection";
import { ImageSidebarToggle } from "./ImageSidebarToggle";
import { OverlaysSection } from "./OverlaysSection/OverlaysSection";
import { OverviewSection } from "./OverviewSection/OverviewSection";
import { SettingsSection } from "./SettingsSection/SettingsSection";
import { ViewsSection } from "./ViewsSection/ViewsSection";
import { Sidebar } from "~/components/Sidebar/Sidebar";

export const IMAGE_SIDEBAR_NAME = "Image Controls";

/** Render order in the sidebar; a docked section always returns to its slot here. */
const SECTIONS: { id: string; Component: ComponentType }[] = [
  { id: "overview", Component: OverviewSection },
  { id: "views", Component: ViewsSection },
  { id: "channels", Component: ChannelsSection },
  { id: "overlays", Component: OverlaysSection },
  { id: "annotations", Component: AnnotationsSection },
  { id: "settings", Component: SettingsSection },
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
      {SECTIONS.map(({ id, Component }) => (
        <Component key={id} />
      ))}
    </Sidebar>
    <ImageSidebarToggle />
  </>
);
