import { IconButton, Menu, MenuItem, TruncatedText } from "@cytario/design";
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
  isOwnView,
  onDelete,
}: {
  index: number;
  canDelete: boolean;
  isOwnView: boolean;
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
  const forkView = useViewerStore((s) => s.forkView);
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

  const ownMenuItems = (
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
  );

  const peerMenuItems = (
    <MenuItem id="fork" icon="Copy" onAction={() => forkView(index)}>
      Copy to my views
    </MenuItem>
  );

  const menuItems = isOwnView ? ownMenuItems : peerMenuItems;

  return (
    <div className="flex items-center gap-1">
      <RadioButton
        aria-label={`Channels view ${index + 1}`}
        className={`
          cursor-pointer
          group/radio-btn
          relative overflow-hidden
          flex items-center gap-2 p-2
          rounded-full h-8
          flex-1
          bg-card
          text-sm

          transition-colors

          data-hovered:bg-muted

          data-selected:border-border
          data-selected:bg-muted

        `}
      >
        <ViewLabel index={index} />
        {isEditing && isOwnView ? (
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
              if (!isOwnView) return;
              e.stopPropagation();
              startEditing();
            }}
          >
            <TruncatedText>{viewName}</TruncatedText>
          </span>
        )}
      </RadioButton>
      <Menu content={menuItems}>
        <IconButton
          icon="EllipsisVertical"
          label={`Actions for view ${index + 1}`}
          variant="ghost"
          size="xs"
        />
      </Menu>
    </div>
  );
}
