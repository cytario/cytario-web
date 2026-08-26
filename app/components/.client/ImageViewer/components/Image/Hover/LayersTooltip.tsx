import { Badge } from "@cytario/design";

import type { TooltipItem, CompositeTooltip } from "../../../state/store/slices/viewer.view.store";
import { GeometrySvg } from "~/components/GeometrySvg";

/** Convert `[r, g, b]` to a CSS color string, or `undefined`. */
const toCssColor = (c?: number[]) => (c ? `rgb(${c[0]}, ${c[1]}, ${c[2]})` : undefined);

/** Small colored swatch used in tooltip rows. */
const Swatch = ({ color }: { color?: number[] }) =>
  color ? (
    <span
      className="inline-block w-2.5 h-2.5 rounded-sm border border-border shrink-0"
      style={{
        backgroundColor: `rgb(${color[0]}, ${color[1]}, ${color[2]})`,
      }}
    />
  ) : null;

/** Thumbnail size for geometry previews inside the tooltip. */
const GEO_THUMB_SIZE = 24;

/** Tooltip section for a channel — single line: swatch + name + value. */
const ChannelSection = ({ item }: { item: TooltipItem }) => {
  const v = item.values[0];
  return (
    <div className="flex items-center justify-between gap-2 px-2 py-1">
      <div>
        <Swatch color={v?.color} />
        <span>{item.label}</span>
      </div>
      {v?.value && <Badge>{v.value}</Badge>}
    </div>
  );
};

/** Tooltip section for a feature (annotation or overlay) — geometry thumbnail
 *  colored as on the deck layer, header label, and key/value rows below. */
const FeatureSection = ({ item }: { item: TooltipItem }) => {
  const geoColor = toCssColor(item.values[0]?.color);
  return (
    <div>
      <div className="flex items-center gap-1.5 px-2 py-1">
        {item.geometry && (
          <GeometrySvg geometry={item.geometry} size={GEO_THUMB_SIZE} color={geoColor} />
        )}
        <span>{item.label}</span>
      </div>
      {item.values.length > 0 && (
        <div className="px-2 py-1 space-y-0.5">
          {item.values.map((v, j) => (
            <div key={j} className="flex items-center gap-1.5">
              <Swatch color={v.color} />
              {v.key && <span>{v.key}</span>}
              {v.value && <span className="font-mono">{v.value}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * Renders the composite hover tooltip for all layers (channels, overlays,
 * annotations). Positioned absolutely relative to the cursor and styled
 * with kind-specific accent borders. Does not capture pointer events.
 *
 * Layout per kind:
 * - **channel** — single line: swatch + channel name + value.
 * - **annotation** — geometry thumbnail (class color) + name + class rows.
 * - **overlay** — geometry thumbnail (marker color) + id + marker rows.
 */
export const LayersTooltip = ({ tooltip }: { tooltip: CompositeTooltip }) => (
  <div
    className="absolute pointer-events-none z-50 min-w-40 max-w-xs"
    style={{ left: tooltip.cursor.x + 12, top: tooltip.cursor.y + 12 }}
  >
    <div className="rounded shadow-lg bg-background border border-border text-foreground text-sm overflow-hidden">
      {tooltip.items.map((item, i) => {
        const sectionBorder = i > 0 ? "border-t border-border" : "";
        return (
          <div key={`${item.providerId}-${i}`} className={sectionBorder}>
            {item.kind === "channel" && <ChannelSection item={item} />}
            {item.kind === "annotation" && <FeatureSection item={item} />}
            {item.kind === "overlay" && <FeatureSection item={item} />}
          </div>
        );
      })}
    </div>
  </div>
);
