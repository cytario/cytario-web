import { IconButton, Menu, MenuItem } from "@cytario/design";
import { useRef } from "react";
import { Radio } from "react-aria-components";
import { twMerge } from "tailwind-merge";

import { ViewStateIcon, type ViewKey } from "./ViewStateIcon";
import { useViewerStore } from "../../../state/store/core/ViewerStoreContext";
import { channelsStateForLayer, select } from "../../../state/store/selectors";
import { SectionRow, type SectionRowHandle } from "../SectionRow/SectionRow";
import { useConnectionsStore } from "~/utils/connectionsStore/useConnectionsStore";
import { parseResourceId } from "~/utils/resourceId";

export function ViewRadioButton({
  index,
  id,
  canDelete,
  viewState,
  onDelete,
}: {
  index: number;
  id: string;
  canDelete: boolean;
  viewState: ViewKey;
  onDelete: () => void;
}) {
  const resourceId = useViewerStore((s) => s.id);
  const { connectionId } = parseResourceId(resourceId);
  const accessLevel = useConnectionsStore(
    (s) => s.connections[connectionId]?.provider?.accessLevel ?? "read-only",
  );
  const activeLayersStateId = useViewerStore(select.activeLayersStateId);
  const isSelected = activeLayersStateId === id;
  const viewName = useViewerStore(select.viewName(index));
  const setViewName = useViewerStore(select.setViewName);
  const shareView = useViewerStore((s) => s.shareView);
  const unshareView = useViewerStore((s) => s.unshareView);
  const forkView = useViewerStore((s) => s.forkView);
  const sectionRowRef = useRef<SectionRowHandle>(null);

  const channelsState = useViewerStore(channelsStateForLayer(index));
  const colors = Object.values(channelsState ?? {})
    .filter(({ isVisible }) => isVisible)
    .map(({ color }) => color);

  const isOwnView = viewState !== "sharedByOthers";
  const isShared = viewState === "sharedByMe";

  const ownMenuItems = (
    <>
      <MenuItem id="rename" icon="Pencil" onAction={() => sectionRowRef.current?.startRename()}>
        Rename
      </MenuItem>
      {accessLevel !== "read-only" && (
        <MenuItem
          id="share"
          icon={isShared ? "Cloud" : "Send"}
          onAction={() => (isShared ? unshareView(index) : shareView(index))}
        >
          {isShared ? "Stop sharing" : "Share"}
        </MenuItem>
      )}
      <MenuItem id="delete" icon="Trash2" isDanger isDisabled={!canDelete} onAction={onDelete}>
        Delete view
      </MenuItem>
    </>
  );

  const peerMenuItems = (
    <MenuItem id="fork" icon="Copy" onAction={() => forkView(index)}>
      Copy to my views
    </MenuItem>
  );

  const menuItems = isOwnView ? ownMenuItems : peerMenuItems;

  return (
    <Radio
      value={id}
      aria-label={`Channels view ${index + 1}`}
      className={twMerge(
        "group/radio cursor-pointer focus:outline-none focus-visible:outline-1 focus-visible:outline-foreground transition-colors",
      )}
    >
      <SectionRow
        ref={sectionRowRef}
        isSelected={isSelected}
        colors={colors}
        title={viewName}
        onRename={isOwnView ? (next) => setViewName(index, next) : undefined}
        actions={
          <>
            <ViewStateIcon viewState={viewState} />
            <span className="flex opacity-0 transition-opacity focus-within:opacity-100 group-hover/controlrow:opacity-100">
              <Menu content={menuItems}>
                <IconButton
                  icon="EllipsisVertical"
                  label={`Actions for view ${index + 1}`}
                  variant="ghost"
                  size="xs"
                />
              </Menu>
            </span>
          </>
        }
      />
    </Radio>
  );
}
