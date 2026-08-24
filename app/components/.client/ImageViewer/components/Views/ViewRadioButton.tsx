import { IconButton, Menu, MenuItem, TruncatedText, useContextMenu } from "@cytario/design";
import { KeyboardEvent, useEffect, useRef, useState } from "react";
import { RadioButton } from "react-aria-components";

import { ViewLabel } from "./ViewLabel";
import { select } from "../../state/store/selectors";
import { useViewerStore } from "../../state/store/ViewerStoreContext";
import { useConnectionsStore } from "~/utils/connectionsStore/useConnectionsStore";
import { parseResourceId } from "~/utils/resourceId";

export function ViewRadioButton({
  index,
  canDelete,
  onDelete,
}: {
  index: number;
  canDelete: boolean;
  onDelete: () => void;
}) {
  const resourceId = useViewerStore((s) => s.id);
  const { connectionId } = parseResourceId(resourceId);
  const canWrite = useConnectionsStore(
    (s) => s.connections[connectionId]?.provider?.canWrite ?? false,
  );
  const viewName = useViewerStore(select.viewName(index));
  const setViewName = useViewerStore(select.setViewName);
  const isShared = useViewerStore((s) => s.layersStates[index]?.shared ?? false);
  const shareView = useViewerStore((s) => s.shareView);
  const unshareView = useViewerStore((s) => s.unshareView);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

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

  const contextMenu = useContextMenu({
    content: (
      <>
        <MenuItem id="rename" icon="Pencil" onAction={startEditing}>
          Rename
        </MenuItem>
        {canWrite && (
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
    ),
  });

  return (
    <div className="flex items-center gap-1">
      <RadioButton
        aria-label={`Channels view ${index + 1}`}
        {...contextMenu.targetProps}
        className={`
          group/radio-btn
          relative overflow-hidden
          flex items-center gap-2
          rounded-sm h-8
          p-0
          flex-1

          border transition-colors
          border-border
          bg-muted
          data-hovered:bg-border

          data-selected:border-ring
          data-selected:ring-1
          data-selected:ring-ring
          data-selected:ring-offset-1
          data-selected:ring-offset-background
        `}
      >
        <ViewLabel index={index} />
        {isEditing ? (
          <input
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={handleKeyDown}
            onDoubleClick={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            className={`
              flex-1 min-w-0 h-full px-1
              bg-background border border-ring rounded-sm
              text-sm outline-none
            `}
          />
        ) : (
          <span
            className="flex-1 min-w-0"
            onDoubleClick={(e) => {
              e.stopPropagation();
              startEditing();
            }}
          >
            <TruncatedText>{viewName}</TruncatedText>
          </span>
        )}
      </RadioButton>
      <Menu
        content={
          <>
            <MenuItem id="rename" icon="Pencil" onAction={startEditing}>
              Rename
            </MenuItem>
            {canWrite && (
              <MenuItem
                id="share"
                icon={isShared ? "Cloud" : "Send"}
                onAction={() => (isShared ? unshareView(index) : shareView(index))}
              >
                {isShared ? "Stop sharing" : "Share"}
              </MenuItem>
            )}
            <MenuItem
              id="delete"
              icon="Trash2"
              isDanger
              isDisabled={!canDelete}
              onAction={onDelete}
            >
              Delete view
            </MenuItem>
          </>
        }
      >
        <IconButton
          icon="EllipsisVertical"
          label={`Actions for view ${index + 1}`}
          variant="ghost"
          size="xs"
        />
      </Menu>
      {contextMenu.menu}
    </div>
  );
}
