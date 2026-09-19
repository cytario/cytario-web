import type { Geometry, Position } from "geojson";

interface GeometrySvgProps {
  geometry: Geometry | null | undefined;
  size?: number;
  padding?: number;
  color?: string;
  selected?: boolean;
}

/** Achromatic white/black/white frame so selection reads on any background. */
const SELECTION_STROKES: { stroke: string; width: number }[] = [
  { stroke: "#fff", width: 5 },
  { stroke: "#000", width: 3.5 },
  { stroke: "#fff", width: 2 },
];

/** Matching white/black/white rings around a selected point. */
const POINT_SELECTION_RINGS: { r: number; stroke: string }[] = [
  { r: 6.5, stroke: "#fff" },
  { r: 5.5, stroke: "#000" },
  { r: 4.5, stroke: "#fff" },
];

const POINT_RADIUS = 3;

/** Coordinate rings (path) plus standalone points. */
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

/** Coordinates are screen-space (Y-down) as-is; parsing/conversion belongs in the caller. */
export const GeometrySvg = ({
  geometry,
  size = 48,
  padding = 8,
  color,
  selected,
}: GeometrySvgProps) => {
  const shape = geometry ? toShape(geometry) : EMPTY;
  const coords = [...shape.rings.flat(), ...shape.points];

  if (coords.length === 0) {
    return <span className="text-muted-foreground italic">invalid</span>;
  }

  const xs = coords.map((p) => p[0]);
  const ys = coords.map((p) => p[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  // Centering uses the true span so a degenerate geometry (single point)
  // lands at the box center despite the clamped scale divisor.
  const spanX = Math.max(...xs) - minX;
  const spanY = Math.max(...ys) - minY;
  const drawable = size - padding * 2;
  const scale = drawable / (Math.max(spanX, spanY) || 1);

  const transform = (p: Position) => ({
    x: (p[0] - minX) * scale + padding + (drawable - spanX * scale) / 2,
    y: (p[1] - minY) * scale + padding + (drawable - spanY * scale) / 2,
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
      className="inline-block shrink-0"
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
          fillOpacity={shape.closed ? 1 : undefined}
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
