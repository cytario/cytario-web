import type { IconName } from "@cytario/design";

import type { TooltipSection } from "../../state/store/types";

/** Identity of the three viewer data sections — the single source consumed by
 *  the sidebar `Section` chrome and the tooltip/popup section headers, so the
 *  two can never drift apart. */
export const VIEWER_SECTIONS: Record<
  TooltipSection,
  { id: string; title: string; icon: IconName }
> = {
  Channels: { id: "channels", title: "Channels", icon: "Microscope" },
  Overlays: { id: "overlays", title: "Overlays", icon: "Layers2" },
  Annotations: { id: "annotations", title: "Annotations", icon: "Lasso" },
};
