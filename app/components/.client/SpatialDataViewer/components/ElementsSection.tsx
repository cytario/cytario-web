import { Checkbox } from "@cytario/design";

import { elementId } from "../state/createSpatialDataViewerStore";
import { useSpatialDataStore } from "../state/SpatialDataStoreContext";
import { Section } from "~/components/Section/Section";

const GROUP_LABELS: Record<string, string> = {
  image: "Images",
  labels: "Labels",
  points: "Points",
  shapes: "Shapes",
};

/** Sidebar elements control: per-element visibility + opacity, grouped by type. */
export function ElementsSection() {
  const elements = useSpatialDataStore((s) => s.elements);
  const setElementVisibility = useSpatialDataStore((s) => s.setElementVisibility);
  const setElementOpacity = useSpatialDataStore((s) => s.setElementOpacity);

  const configs = Object.values(elements);
  const visibleCount = configs.filter((e) => e.isVisible).length;
  const badge = configs.length ? `${visibleCount}/${configs.length}` : undefined;

  const grouped = configs.reduce<Record<string, typeof configs>>((acc, config) => {
    const group = acc[config.elementType] ?? [];
    group.push(config);
    acc[config.elementType] = group;
    return acc;
  }, {});

  return (
    <Section pillar="spatial-elements" badge={badge}>
      <div className="flex flex-col gap-4 p-2">
        {Object.entries(grouped).map(([elementType, group]) => (
          <div key={elementType} className="flex flex-col gap-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {GROUP_LABELS[elementType] ?? elementType}
            </p>
            {group.map((config) => {
              const id = elementId(config.elementType, config.elementKey);
              return (
                <div key={id} className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      aria-label={`Toggle ${config.elementKey}`}
                      isSelected={config.isVisible}
                      onChange={(isSelected) => setElementVisibility(id, isSelected)}
                    >
                      <span className="truncate text-sm">{config.elementKey}</span>
                    </Checkbox>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    aria-label={`${config.elementKey} opacity`}
                    className="h-4 w-full cursor-pointer accent-primary"
                    value={Math.round(config.opacity * 100)}
                    onChange={(e) => setElementOpacity(id, Number(e.target.value) / 100)}
                  />
                </div>
              );
            })}
          </div>
        ))}
        {configs.length === 0 && <p className="text-sm text-muted-foreground">No elements</p>}
      </div>
    </Section>
  );
}
