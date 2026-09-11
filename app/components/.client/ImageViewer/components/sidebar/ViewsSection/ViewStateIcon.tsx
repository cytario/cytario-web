import { Icon, Tooltip } from "@cytario/design";
import type { IconName } from "@cytario/design";

export type ViewKey = "local" | "sharedByMe" | "sharedByOthers";

const VIEW_STATES: Record<ViewKey, { icon: IconName; label: string }> = {
  local: { icon: "CircleDashed", label: "Local view" },
  sharedByMe: { icon: "Share2", label: "Shared by me" },
  sharedByOthers: { icon: "Users", label: "Shared by others" },
};

export function ViewStateIcon({ viewState }: { viewState: ViewKey }) {
  const { icon, label } = VIEW_STATES[viewState];

  return (
    <Tooltip content={label}>
      <Icon icon={icon} size="xs" className="text-muted-foreground" />
    </Tooltip>
  );
}
