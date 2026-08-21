import { IconButton, Menu, MenuItem } from "@cytario/design";
import { RadioButton } from "react-aria-components";

import { PresetLabel } from "./PresetLabel";

export function PresetRadioButton({
  index,
  canDelete,
  onDelete,
}: {
  index: number;
  canDelete: boolean;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <RadioButton
        aria-label={`Channels preset ${index + 1}`}
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
        <PresetLabel index={index} />
        <span>{index + 1}</span>
      </RadioButton>
      <Menu
        content={
          <MenuItem id="delete" icon="Trash2" isDanger isDisabled={!canDelete} onAction={onDelete}>
            Delete preset
          </MenuItem>
        }
      >
        <IconButton
          icon="EllipsisVertical"
          label={`Actions for preset ${index + 1}`}
          variant="ghost"
          size="xs"
        />
      </Menu>
    </div>
  );
}
