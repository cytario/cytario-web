import { IconButton, Menu, MenuItem, MenuSeparator } from "@cytario/design";
import type { Geometry } from "geojson";

import { GeometrySvg, type Point } from "~/components/DataGrid/GeometrySvg";
import type { AnnotationFeature } from "~/utils/db/getAnnotationsWasm";

const THUMB_SIZE = 48;

/** GeoJSON polygon geometry → screen-space rings (annotation coords are already
 *  pixel space, Y-down — no flip). Points have no rings; the caller renders a
 *  glyph. Annotation draw modes only emit Polygon/Point. */
const geometryToRings = (geometry: Geometry): Point[][] => {
  if (geometry.type === "Polygon") {
    return geometry.coordinates.map((ring) => ring.map(([x, y]) => ({ x, y })));
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.flatMap((polygon) =>
      polygon.map((ring) => ring.map(([x, y]) => ({ x, y }))),
    );
  }
  return [];
};

/** Concentric white/black/white rings around a selected point, mirroring the
 *  on-slide point selection frame. Radii outermost-first (drawn underneath). */
const POINT_SELECTION_RINGS = [
  { r: 6.5, stroke: "#fff" },
  { r: 5.5, stroke: "#000" },
  { r: 4.5, stroke: "#fff" },
];

const GeometryThumb = ({
  geometry,
  color,
  selected,
}: {
  geometry: Geometry;
  color?: string;
  selected?: boolean;
}) => {
  if (geometry.type === "Point") {
    const c = THUMB_SIZE / 2;
    return (
      <svg width={THUMB_SIZE} height={THUMB_SIZE} className="inline-block rounded bg-muted">
        {selected &&
          POINT_SELECTION_RINGS.map((ring) => (
            <circle
              key={ring.r}
              cx={c}
              cy={c}
              r={ring.r}
              fill="none"
              stroke={ring.stroke}
              strokeWidth={1.5}
            />
          ))}
        <circle
          cx={c}
          cy={c}
          r={3}
          fill={color ?? "currentColor"}
          className={color ? undefined : "fill-secondary"}
        />
      </svg>
    );
  }
  return (
    <GeometrySvg
      rings={geometryToRings(geometry)}
      size={THUMB_SIZE}
      color={color}
      selected={selected}
    />
  );
};

interface AnnotationThumbProps {
  feature: AnnotationFeature;
  selected: boolean;
  /** Classification color for the glyph, or undefined for the unclassified fallback. */
  color?: string;
  /** Own set → destructive actions enabled; peers are read-only. */
  editable: boolean;
  /** Existing class names offered as move targets (own set only). */
  classNames?: string[];
  onSelect: (event: React.MouseEvent) => void;
  onZoom: () => void;
  /** Assign the selection to a class (own set only). */
  onClassify?: (name: string) => void;
  /** Clear the selection's classification → Unclassified (own set only). */
  onClear?: () => void;
  onDelete: () => void;
}

/** A single annotation in the sidebar list: a selectable geometry thumbnail with
 *  a hover/focus-revealed actions menu (zoom, classify, delete). */
export const AnnotationThumb = ({
  feature,
  selected,
  color,
  editable,
  classNames,
  onSelect,
  onZoom,
  onClassify,
  onClear,
  onDelete,
}: AnnotationThumbProps) => {
  return (
    <div className="group/thumb relative">
      <button
        type="button"
        aria-pressed={selected}
        onClick={onSelect}
        className="rounded border border-border text-muted-foreground hover:text-foreground"
      >
        <GeometryThumb geometry={feature.geometry} color={color} selected={selected} />
      </button>

      <Menu
        content={
          <>
            <MenuItem id="zoom" icon="ZoomIn" onAction={onZoom}>
              Zoom to annotation
            </MenuItem>
            {editable && onClassify && ((classNames?.length ?? 0) > 0 || onClear) && (
              <>
                <MenuSeparator />
                {(classNames ?? []).map((name) => (
                  <MenuItem
                    key={name}
                    id={`move:${name}`}
                    icon="Tag"
                    onAction={() => onClassify(name)}
                  >
                    Move to {name}
                  </MenuItem>
                ))}
                {onClear && (
                  <MenuItem id="unclassify" icon="X" onAction={onClear}>
                    Clear classification
                  </MenuItem>
                )}
              </>
            )}
            <MenuSeparator />
            <MenuItem id="delete" icon="Trash2" isDanger isDisabled={!editable} onAction={onDelete}>
              Delete annotation
            </MenuItem>
          </>
        }
      >
        <IconButton
          icon="EllipsisVertical"
          label="Annotation actions"
          variant="ghost"
          size="xs"
          // Show on thumb hover or keyboard focus-within (the menu trigger), so the actions stay discoverable without cluttering every thumbnail.
          className="absolute top-0 right-0 opacity-0 transition-opacity group-hover/thumb:opacity-100 focus-within:opacity-100"
        />
      </Menu>
    </div>
  );
};
