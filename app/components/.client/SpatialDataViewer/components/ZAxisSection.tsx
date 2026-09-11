import { useMemo } from "react";

import { elementId } from "../state/createSpatialDataViewerStore";
import { useSpatialDataStore } from "../state/SpatialDataStoreContext";
import { Section } from "~/components/Section/Section";

/** Sidebar z control: z-plane slider per visible z-bearing raster element. */
export function ZAxisSection() {
  const elements = useSpatialDataStore((s) => s.elements);
  const setElementZIndex = useSpatialDataStore((s) => s.setElementZIndex);

  const zElements = useMemo(
    () =>
      Object.values(elements).filter(
        (config) =>
          config.isVisible &&
          (config.elementType === "image" || config.elementType === "labels") &&
          (config.zSize ?? 1) > 1,
      ),
    [elements],
  );

  if (zElements.length === 0) return null;

  return (
    <Section pillar="z-planes">
      <div className="flex flex-col gap-3 p-2">
        {zElements.map((config) => {
          const id = elementId(config.elementType, config.elementKey);
          const zSize = config.zSize ?? 1;
          const zIndex = config.zIndex ?? 0;
          return (
            <div key={id} className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm">{config.elementKey}</span>
                <span className="text-xs text-muted-foreground" aria-hidden>
                  z {zIndex}/{zSize - 1}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={zSize - 1}
                step={1}
                aria-label={`${config.elementKey} z plane`}
                aria-valuetext={`plane ${zIndex} of ${zSize}`}
                className="h-4 w-full cursor-pointer accent-primary"
                value={zIndex}
                onChange={(e) => setElementZIndex(id, Number(e.target.value))}
              />
            </div>
          );
        })}
      </div>
    </Section>
  );
}
