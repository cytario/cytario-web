export interface Point {
  x: number;
  y: number;
}

interface GeometrySvgProps {
  /** Coordinate rings in screen space (Y grows down, same as SVG). */
  rings: Point[][];
  size?: number;
  /** CSS color for fill + stroke; falls back to the `text-secondary` token. */
  color?: string;
}

const PADDING = 2;

/**
 * Renders coordinate rings as a fitted SVG thumbnail. Pure renderer: it scales
 * and centers the rings into a `size`×`size` box with no axis flip — callers
 * pass rings already in screen space (Y-down). Source-format parsing (WKT,
 * GeoJSON, …) and any coordinate-space conversion belong in the caller.
 */
export const GeometrySvg = ({ rings, size = 48, color }: GeometrySvgProps) => {
  if (rings.length === 0) {
    return <span className="text-muted-foreground italic">invalid</span>;
  }

  const points = rings.flat();
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const width = Math.max(...xs) - minX || 1;
  const height = Math.max(...ys) - minY || 1;
  const scale = (size - PADDING * 2) / Math.max(width, height);

  const transform = (p: Point) => ({
    x: (p.x - minX) * scale + PADDING + (size - PADDING * 2 - width * scale) / 2,
    y: (p.y - minY) * scale + PADDING + (size - PADDING * 2 - height * scale) / 2,
  });

  const pathData = rings
    .map((ring) => {
      const transformed = ring.map(transform);
      return (
        transformed
          .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
          .join(" ") + " Z"
      );
    })
    .join(" ");

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="inline-block rounded bg-muted"
    >
      <path
        d={pathData}
        fill={color ?? "currentColor"}
        fillOpacity={0.3}
        stroke={color ?? "currentColor"}
        strokeWidth={1}
        className={color ? undefined : "text-secondary"}
      />
    </svg>
  );
};
