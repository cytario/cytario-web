import type { Geometry, Position } from "geojson";

interface GeometrySvgProps {
  /** GeoJSON geometry in screen space (Y grows down, same as SVG — no axis flip). */
  geometry: Geometry | null | undefined;
  size?: number;
  /** CSS color for fill + stroke; falls back to the `text-secondary` token. */
  color?: string;
  /** Draw the achromatic white/black/white selection frame, mirroring the
   *  on-slide selection halo. */
  selected?: boolean;
}

// Default inset; when selected, the widest frame stroke bleeds ±(width/2)
// outside the path, so pad more to keep it inside the viewBox.
const PADDING = 2;
const SELECTED_PADDING = 4;

/** White/black/white selection frame for paths, widest first (rendered
 *  underneath), so the achromatic frame reads on any background. */
const SELECTION_STROKES: { stroke: string; width: number }[] = [
  { stroke: "#fff", width: 5 },
  { stroke: "#000", width: 3.5 },
  { stroke: "#fff", width: 2 },
];

/** Concentric white/black/white rings around a selected point, mirroring the
 *  on-slide point selection frame. Radii outermost-first (drawn underneath). */
const POINT_SELECTION_RINGS: { r: number; stroke: string }[] = [
  { r: 6.5, stroke: "#fff" },
  { r: 5.5, stroke: "#000" },
  { r: 4.5, stroke: "#fff" },
];

const POINT_RADIUS = 3;

/** Renderable decomposition of a geometry: closed/open coordinate rings (for a
 *  path) and standalone points (for glyphs). */
interface Shape {
  rings: Position[][];
  /** Rings are polygon rings (close with `Z`); false for open line strings. */
  closed: boolean;
  points: Position[];
}

const EMPTY: Shape = { rings: [], closed: false, points: [] };

const toShape = (geometry: Geometry): Shape => {
  switch (geometry.type) {
    case "Point":
      return { ...EMPTY, points: [geometry.coordinates] };
    case "MultiPoint":
      return { ...EMPTY, points: geometry.coordinates };
    case "LineString":
      return { rings: [geometry.coordinates], closed: false, points: [] };
    case "MultiLineString":
      return { rings: geometry.coordinates, closed: false, points: [] };
    case "Polygon":
      return { rings: geometry.coordinates, closed: true, points: [] };
    case "MultiPolygon":
      return { rings: geometry.coordinates.flat(), closed: true, points: [] };
    default:
      return EMPTY;
  }
};

/**
 * Renders a GeoJSON geometry as a fitted `size`×`size` SVG thumbnail. Polygons
 * and line strings draw as a path (polygons filled + closed), points as dots;
 * a `selected` treatment adds the achromatic selection frame. Coordinates are
 * taken as-is (screen space, Y-down) — source parsing (WKT via `wktToGeometry`,
 * …) and any coordinate-space conversion belong in the caller.
 */
export const GeometrySvg = ({ geometry, size = 48, color, selected }: GeometrySvgProps) => {
  const shape = geometry ? toShape(geometry) : EMPTY;
  const coords = [...shape.rings.flat(), ...shape.points];

  if (coords.length === 0) {
    return <span className="text-muted-foreground italic">invalid</span>;
  }

  const padding = selected ? SELECTED_PADDING : PADDING;
  const xs = coords.map((p) => p[0]);
  const ys = coords.map((p) => p[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const width = Math.max(...xs) - minX || 1;
  const height = Math.max(...ys) - minY || 1;
  const scale = (size - padding * 2) / Math.max(width, height);

  const transform = (p: Position) => ({
    x: (p[0] - minX) * scale + padding + (size - padding * 2 - width * scale) / 2,
    y: (p[1] - minY) * scale + padding + (size - padding * 2 - height * scale) / 2,
  });

  const pathData = shape.rings
    .map((ring) => {
      const d = ring
        .map(transform)
        .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
        .join(" ");
      return shape.closed ? `${d} Z` : d;
    })
    .join(" ");
  const glyphs = shape.points.map(transform);

  const stroke = color ?? "currentColor";
  const colorClass = color ? undefined : "text-secondary";

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="inline-block bg-muted"
    >
      {selected &&
        pathData &&
        SELECTION_STROKES.map((s, i) => (
          <path
            key={i}
            d={pathData}
            fill="none"
            stroke={s.stroke}
            strokeWidth={s.width}
            strokeLinejoin="round"
          />
        ))}

      {pathData && (
        <path
          d={pathData}
          fill={shape.closed ? stroke : "none"}
          fillOpacity={shape.closed ? 0.3 : undefined}
          stroke={stroke}
          strokeWidth={1}
          className={colorClass}
        />
      )}

      {glyphs.map((p, i) => (
        <g key={i} className={colorClass}>
          {selected &&
            POINT_SELECTION_RINGS.map((ring) => (
              <circle
                key={ring.r}
                cx={p.x}
                cy={p.y}
                r={ring.r}
                fill="none"
                stroke={ring.stroke}
                strokeWidth={1.5}
              />
            ))}
          <circle cx={p.x} cy={p.y} r={POINT_RADIUS} fill={stroke} />
        </g>
      ))}
    </svg>
  );
};
