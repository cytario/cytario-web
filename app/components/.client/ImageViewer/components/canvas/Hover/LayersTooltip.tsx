import { Badge, Button, Icon, TruncatedText } from "@cytario/design";
import { useLayoutEffect, useRef } from "react";

import { anchoredPopupPosition } from "./PopupCard";
import type {
  CompositeTooltip,
  LayerTooltipItem,
  TooltipSection,
} from "../../../state/store/types";
import { type JoinOfferAction } from "../../annotations/joinFeatures";
import { VIEWER_SECTIONS } from "../../sidebar/sections";
import { classNameOfItem } from "../Annotations/pickFeaturesAt";
import { GeometrySvg } from "~/components/GeometrySvg";

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
              <Badge color="neutral" size="sm">
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

/** Class-sorted annotation items with each class group's "Join <n> <class>
 *  annotations" button rendered right after the group's run of items. Offers
 *  are matched by class name — the snapshot items don't carry set identity, so
 *  when two sets have the same class at one point the first offer (topmost
 *  z-order) wins. */
function AnnotationItemsWithJoins({
  items,
  joinOffers,
}: {
  items: LayerTooltipItem[];
  joinOffers: JoinOfferAction[];
}) {
  const offersByClass = new Map(joinOffers.map((offer) => [offer.className, offer]));
  const nodes: React.ReactNode[] = [];
  let runClass: string | null = null;

  const flushRun = (key: string) => {
    if (runClass === null) return;
    const offer = offersByClass.get(runClass);
    if (offer) {
      nodes.push(
        <div key={key} className="px-2 pb-1.5">
          <JoinOfferButton offer={offer} />
        </div>,
      );
    }
  };

  items.forEach((item, i) => {
    const cls = classNameOfItem(item);
    if (runClass !== null && cls !== runClass) {
      flushRun(`join:${runClass}`);
    }
    runClass = cls;
    nodes.push(<Section key={item.id ?? i} item={item} />);
  });
  flushRun("join:last");

  return <>{nodes}</>;
}

const JoinOfferButton = ({ offer }: { offer: JoinOfferAction }) => (
  <Button size="xs" variant="neutral" onPress={offer.onJoin}>
    Join {offer.count} {offer.className} annotations
  </Button>
);

/** The shared body: section headers, item rows, and the per-class Join offers.
 *  Pure rendering — the hover tooltip positions itself around it; the click
 *  popup composes it inside its own chrome ({@link PopupCard}). */
export function TooltipSections({
  sections,
  joinOffers = [],
}: {
  sections: CompositeTooltip["sections"];
  joinOffers?: JoinOfferAction[];
}) {
  const entries = SECTION_ORDER.filter((s) => sections[s]?.length).map(
    (s) => [s, sections[s]!] as [TooltipSection, LayerTooltipItem[]],
  );

  return (
    <>
      {entries.map(([type, items]) => (
        <div key={type}>
          <div className="flex items-center gap-1.5 bg-background px-2 py-1 border-t border-border first:border-t-0">
            <Icon icon={VIEWER_SECTIONS[type].icon} size="sm" />
            <span>{VIEWER_SECTIONS[type].title}</span>
          </div>
          {type === "Annotations" ? (
            <AnnotationItemsWithJoins items={items} joinOffers={joinOffers} />
          ) : (
            items.map((item, i) => <Section key={item.id ?? i} item={item} />)
          )}
        </div>
      ))}
    </>
  );
}

/** Hover tooltip — the snapshot renderer for the inspect-mode cursor readout.
 *  The click popup composes its own chrome ({@link PopupCard}) around the same
 *  section rendering. */
export const LayersTooltip = ({ tooltip }: { tooltip: CompositeTooltip }) => {
  const ref = useRef<HTMLDivElement>(null);

  const entries = SECTION_ORDER.filter((s) => tooltip.sections[s]?.length).map(
    (s) => [s, tooltip.sections[s]!] as [TooltipSection, LayerTooltipItem[]],
  );

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || entries.length === 0) return;

    const parent = el.offsetParent as HTMLElement | null;
    if (!parent) return;

    const { width, height } = el.getBoundingClientRect();
    const { x, y } = anchoredPopupPosition(width, height, tooltip.cursor, {
      width: parent.clientWidth,
      height: parent.clientHeight,
    });

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
    >
      <TooltipSections sections={tooltip.sections} />
    </div>
  );
};
