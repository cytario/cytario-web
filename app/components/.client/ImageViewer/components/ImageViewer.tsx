import { IconButtonToggle } from "@cytario/design";
import { useEffect, useRef } from "react";

import { AnnotationsPanel } from "./AnnotationsPanel/AnnotationsPanel";
import { ChannelsPanel } from "./ChannelsPanel/ChannelsPanel";
import { ImagePreview } from "./Image/ImagePreview";
import { useAnnotationModeKeyboard } from "./Image/useAnnotationModeKeyboard";
import { ImagePanels } from "./ImagePanels";
import { Magnifier } from "./Magnifier";
import { OverlaysPanel } from "./OverlaysPanel/OverlaysPanel";
import { Presets } from "./Presets/Presets";
import { ViewerHeader } from "./ViewerHeader";
import { MissingOffsetsError } from "../state/loaders/loadOmeTiffWithCredentials";
import { select } from "../state/store/selectors";
import { useUndoRedoShortcuts } from "../state/store/useUndoRedoShortcuts";
import { useViewerStore, ViewerStoreProvider } from "../state/store/ViewerStoreContext";
import { createSidebarStore } from "~/components/Sidebar/createSidebarStore";
import { Sidebar, SIDEBAR, sidebarDomId, sidebarToggleId } from "~/components/Sidebar/Sidebar";
import { useModal } from "~/hooks/useModal";
import { useConnectionsStore } from "~/utils/connectionsStore/useConnectionsStore";
import { parseResourceId } from "~/utils/resourceId";
import type { SignedFetch } from "~/utils/signedFetch";

interface ViewerProps {
  resourceId: string;
  signedFetch: SignedFetch;
}

export const useViewerSidebarStore = createSidebarStore({ name: "ViewerSidebar" });

export const Viewer = ({ signedFetch, resourceId }: ViewerProps) => {
  return (
    <ViewerStoreProvider resourceId={resourceId} signedFetch={signedFetch}>
      <UndoRedoShortcuts />
      <AnnotationModeKeyboard />
      <MissingOffsetsPrompt resourceId={resourceId} />
      <ViewerHeader>
        {({ metadata, viewStateActive, setViewStateActive }) => (
          <Magnifier
            metadata={metadata}
            viewStateActive={viewStateActive}
            setViewStateActive={setViewStateActive}
          />
        )}
      </ViewerHeader>

      <div
        data-theme="dark"
        className="relative flex grow h-full bg-background text-foreground overflow-hidden"
      >
        <ImagePanels />
        <Sidebar
          name={SIDEBAR.viewer}
          side="right"
          store={useViewerSidebarStore}
          toggleShortcut="mod+alt+b"
          openOnMount
        >
          <Presets>
            <div className="block h-60 w-full shrink-0">
              <ImagePreview isInteractive />
            </div>
            <ChannelsPanel />
            <OverlaysPanel />
            <AnnotationsPanel />
          </Presets>
        </Sidebar>
        <ViewerSidebarToggle />
      </div>
    </ViewerStoreProvider>
  );
};

// Mounts the keyboard shortcut listener inside the ViewerStoreProvider.
function UndoRedoShortcuts() {
  useUndoRedoShortcuts();
  return null;
}

// Mounts the annotation-mode keyboard shortcuts (Esc→view, Space→temp drag)
// inside the ViewerStoreProvider.
function AnnotationModeKeyboard() {
  useAnnotationModeKeyboard();
  return null;
}

// Opens the "generate offsets" modal whenever the offsets sidecar is absent
// for an OME-TIFF and the user can write to the connection's prefix. Offered at
// most once per viewer mount: the `offsetsMissing` store flag stays true after a
// dismissal, so without this gate the effect would re-open the modal (and fight
// the back button) the moment the user closed it.
function MissingOffsetsPrompt({ resourceId }: { resourceId: string }) {
  const error = useViewerStore(select.error);
  const offsetsMissing = useViewerStore(select.offsetsMissing);
  const { openModal, modalName } = useModal();
  const offeredRef = useRef(false);

  const { connectionId } = parseResourceId(resourceId);
  const canWrite = useConnectionsStore(
    (s) => s.connections[connectionId]?.provider?.canWrite ?? false,
  );

  useEffect(() => {
    if (offeredRef.current) return;
    if (modalName) return;
    if (!canWrite) return;
    if (!offsetsMissing && !(error instanceof MissingOffsetsError)) return;
    offeredRef.current = true;
    openModal("generate-offsets", { resourceId, connectionId });
  }, [offsetsMissing, error, canWrite, openModal, resourceId, connectionId, modalName]);

  return null;
}

// Always-visible toggle (bottom-right) so the panel can be reopened when collapsed.
function ViewerSidebarToggle() {
  const isOpen = useViewerSidebarStore((s) => s.isOpen);
  const toggle = useViewerSidebarStore((s) => s.toggle);
  return (
    <div data-theme="dark" className="absolute right-2 bottom-2 z-40">
      <IconButtonToggle
        id={sidebarToggleId(SIDEBAR.viewer)}
        icon={isOpen ? "PanelRightClose" : "PanelRightOpen"}
        label="Toggle image controls"
        aria-controls={sidebarDomId(SIDEBAR.viewer)}
        aria-expanded={isOpen}
        variant="ghost"
        isSelected={isOpen}
        onChange={toggle}
      />
    </div>
  );
}
