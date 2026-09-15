import { IconButton, Menu, MenuItem, TruncatedText } from "@cytario/design";
import { KeyboardEvent, useEffect, useRef, useState } from "react";
import { Radio } from "react-aria-components";
import { twMerge } from "tailwind-merge";

import { ViewStateIcon, type ViewKey } from "./ViewStateIcon";
import { useViewerStore } from "../../../state/store/core/ViewerStoreContext";
import { channelsStateForLayer, select } from "../../../state/store/selectors";
import { SectionRow } from "../SectionRow/SectionRow";
import { useConnectionsStore } from "~/utils/connectionsStore/useConnectionsStore";
import { parseResourceId } from "~/utils/resourceId";

export function ViewRadioButton({
  index,
  canDelete,
  viewState,
  onDelete,
}: {
  index: number;
  canDelete: boolean;
  viewState: ViewKey;
  onDelete: () => void;
}) {
  const resourceId = useViewerStore((s) => s.id);
  const { connectionId } = parseResourceId(resourceId);
  const accessLevel = useConnectionsStore(
    (s) => s.connections[connectionId]?.provider?.accessLevel ?? "read-only",
  );
  const activePresetIndex = useViewerStore(select.activePresetIndex);
  const isActive = activePresetIndex === index;
  const viewName = useViewerStore(select.viewName(index));
  const setViewName = useViewerStore(select.setViewName);
  const shareView = useViewerStore((s) => s.shareView);
  const unshareView = useViewerStore((s) => s.unshareView);
  const forkView = useViewerStore((s) => s.forkView);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const channelsState = useViewerStore(channelsStateForLayer(index));
  const colors = Object.values(channelsState ?? {})
    .filter(({ isVisible }) => isVisible)
    .map(({ color }) => color);

  const isOwnView = viewState !== "sharedByOthers";
  const isShared = viewState === "sharedByMe";

  const startEditing = () => {
    setEditValue(viewName);
    setIsEditing(true);
  };

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  const commitEdit = () => {
    const trimmed = editValue.trim();
    setViewName(index, trimmed || null);
    setIsEditing(false);
  };

  const cancelEdit = () => {
    setIsEditing(false);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitEdit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelEdit();
    }
  };

  const ownMenuItems = (
    <>
      <MenuItem id="rename" icon="Pencil" onAction={startEditing}>
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
      value={String(index)}
      aria-label={`Channels view ${index + 1}`}
      className={twMerge(
        "group/radio cursor-pointer focus:outline-none focus-visible:outline-1 focus-visible:outline-foreground transition-colors",
      )}
    >
      <SectionRow
        selected={isActive}
        colors={colors}

        titleTruncate={!isEditing}
        title={
          isEditing && isOwnView ? (
            <input
              ref={inputRef}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={handleKeyDown}
              onDoubleClick={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              className={twMerge(
                "w-full min-w-0 h-full px-1",
                "bg-background border border-ring rounded-sm",
                "text-sm outline-none",
              )}
            />
          ) : (
            <span
              onDoubleClick={(e) => {
                if (!isOwnView) return;
                e.stopPropagation();
                startEditing();
              }}
            >
              <TruncatedText>{viewName}</TruncatedText>
            </span>
          )
        }
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
