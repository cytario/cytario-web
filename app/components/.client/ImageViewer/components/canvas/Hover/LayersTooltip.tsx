import { Badge, Icon, IconButton, TruncatedText } from "@cytario/design";
import { useLayoutEffect, useRef } from "react";

import type {
  CompositeTooltip,
  LayerTooltipItem,
  TooltipSection,
} from "../../../state/store/types";
import { VIEWER_SECTIONS } from "../../sidebar/sections";
import { GeometrySvg } from "~/components/GeometrySvg";

const TOOLTIP_OFFSET = 12;
const VIEWPORT_MARGIN = 4;

const GEO_THUMB_SIZE = 48;

const Section = ({ item }: { item: LayerTooltipItem }) => {
  const geoColor = item.geometryColor
    ? `rgb(${item.geometryColor[0]}, ${item.geometryColor[1]}, ${item.geometryColor[2]})`
    : undefined;

  return (
    <div className="flex items-start justify-between border-t border-border first:border-t-0">
      <div className="flex-1 min-w-0 p-2 gap-2">
        {item.id && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Icon icon="Tag" size="sm" />
            <TruncatedText>{item.id}</TruncatedText>
          </div>
        )}
        {/* Values */}
        {Object.entries(item.values).map(([label, { value, color = [255, 255, 255] }]) => (
          <div key={label} className="flex items-center gap-2 justify-between">
            <div className="flex grow items-center gap-1.5 w-full">
              <span
                className="inline-block w-4 h-4 rounded-full border border-border shrink-0"
                style={{ backgroundColor: `rgb(${color[0]}, ${color[1]}, ${color[2]})` }}
                title={label}
              />
              <span>{label}</span>
            </div>
            {value && (
              <Badge color="slate" size="sm">
                {value}
              </Badge>
            )}
          </div>
        ))}
      </div>

      {item.geometry && (
        <div className="flex items-center gap-2 justify-between shrink-0">
          <GeometrySvg geometry={item.geometry} size={GEO_THUMB_SIZE} color={geoColor} />
        </div>
      )}
    </div>
  );
};

const SECTION_ORDER: TooltipSection[] = ["Channels", "Overlays", "Annotations"];

interface LayersTooltipProps {
  tooltip: CompositeTooltip;
  /** Click-popup mode: adds a header with a close affordance and dialog
   *  semantics; without it the component is the plain hover tooltip. */
  pinned?: boolean;
  onClose?: () => void;
}

export const LayersTooltip = ({ tooltip, pinned = false, onClose }: LayersTooltipProps) => {
  const ref = useRef<HTMLDivElement>(null);

  const entries = SECTION_ORDER.filter((s) => tooltip.sections[s]?.length).map(
    (s) => [s, tooltip.sections[s]!] as [TooltipSection, LayerTooltipItem[]],
  );

  // Non-modal dialog: take focus so Escape and screen readers work without a
  // focus trap (the sidebar stays usable).
  useLayoutEffect(() => {
    if (pinned) ref.current?.focus();
  }, [pinned]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || entries.length === 0) return;

    const parent = el.offsetParent as HTMLElement | null;
    if (!parent) return;

    const { width, height } = el.getBoundingClientRect();
    const vw = parent.clientWidth;
    const vh = parent.clientHeight;
    const ax = tooltip.cursor.x;
    const ay = tooltip.cursor.y;

    let x = ax + TOOLTIP_OFFSET;
    let y = ay + TOOLTIP_OFFSET;
    if (ax + width > vw) x = ax - width - TOOLTIP_OFFSET;
    if (ay + height > vh) y = ay - height - TOOLTIP_OFFSET;
    x = Math.max(VIEWPORT_MARGIN, Math.min(x, vw - width - VIEWPORT_MARGIN));
    y = Math.max(VIEWPORT_MARGIN, Math.min(y, vh - height - VIEWPORT_MARGIN));

    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
  });

  if (entries.length === 0) return null;

  const cx = `
    absolute z-50
    w-60
    rounded-sm shadow-lg
    bg-background/80 backdrop-blur-sm text-foreground
    border border-border
    text-sm
    overflow-hidden
    outline-none
  `;

  return (
    <div
      ref={ref}
      className={cx}
      style={{ left: tooltip.cursor.x + 12, top: tooltip.cursor.y + 12 }}
      {...(pinned
        ? {
            "data-image-popup": true,
            role: "dialog",
            "aria-modal": false,
            "aria-label": "Image details at the clicked point",
            tabIndex: -1,
          }
        : {})}
    >
      {/* Popup Header */}
      {pinned && (
        <div className="flex items-center justify-between bg-background px-2 py-1 border-b border-border">
          <span className="text-xs text-muted-foreground">Image details</span>
          <IconButton icon="X" label="Close popup" size="xs" variant="ghost" onPress={onClose} />
        </div>
      )}

      {/* Layer Items */}
      {entries.map(([type, items]) => (
        <div key={type}>
          {/* Section Header */}
          <div className="flex items-center gap-1.5 bg-background px-2 py-1 border-t border-border first:border-t-0">
            <Icon icon={VIEWER_SECTIONS[type].icon} size="sm" />
            <span>{VIEWER_SECTIONS[type].title}</span>
          </div>
          {items.map((item, i) => (
            <Section key={item.id ?? i} item={item} />
          ))}
        </div>
      ))}
    </div>
  );
};
