import { Select, type SelectItem } from "@cytario/design";
import { useMemo } from "react";

import { useSpatialDataStore } from "../state/SpatialDataStoreContext";
import { Section } from "~/components/Section/Section";

/** Coordinate-system picker — shown only when more than one exists. */
export function CoordinateSystemSection() {
  const spatialData = useSpatialDataStore((s) => s.spatialData);
  const coordinateSystem = useSpatialDataStore((s) => s.coordinateSystem);
  const setCoordinateSystem = useSpatialDataStore((s) => s.setCoordinateSystem);

  const coordinateSystems = useMemo(() => spatialData?.coordinateSystems ?? [], [spatialData]);

  const items = useMemo<SelectItem[]>(
    () => coordinateSystems.map((name) => ({ id: name, name })),
    [coordinateSystems],
  );

  if (coordinateSystems.length <= 1) return null;

  return (
    <Section pillar="coordinate-systems">
      <div className="p-2">
        <Select
          size="sm"
          className="w-full"
          aria-label="Coordinate system"
          items={items}
          value={coordinateSystem ?? undefined}
          onChange={(key) => setCoordinateSystem(String(key))}
        />
      </div>
    </Section>
  );
}
