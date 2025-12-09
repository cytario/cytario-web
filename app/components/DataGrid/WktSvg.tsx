import { parseSync } from "@loaders.gl/core";
import { WKTLoader } from "@loaders.gl/wkt";

interface WktSvgProps {
  wkt: string;
  size?: number;
}

interface Point {
  x: number;
  y: number;
}

/**
 * Parse WKT polygon string and render as SVG
 */
export const WktSvg = ({ wkt, size = 48 }: WktSvgProps) => {
  const paths = parseWkt(wkt);

  if (paths.length === 0) {
    return <span className="text-gray-400 italic">invalid</span>;
  }

  // Calculate bounding box across all paths
  const allPoints = paths.flat();
  const xs = allPoints.map((p) => p.x);
  const ys = allPoints.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const width = maxX - minX || 1;
  const height = maxY - minY || 1;
  const padding = 2;
  const scale = (size - padding * 2) / Math.max(width, height);

  // Transform points to fit in SVG with padding
  const transformPoint = (p: Point) => ({
    x: (p.x - minX) * scale + padding + (size - padding * 2 - width * scale) / 2,
    // Flip Y axis (SVG Y grows down, geo Y grows up)
    y: size - ((p.y - minY) * scale + padding + (size - padding * 2 - height * scale) / 2),
  });

  const pathData = paths
    .map((ring) => {
      const transformed = ring.map(transformPoint);
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
      className="inline-block bg-gray-50 dark:bg-slate-700 rounded"
    >
      <path
        d={pathData}
        fill="currentColor"
        fillOpacity={0.3}
        stroke="currentColor"
        strokeWidth={1}
        className="text-cytario-turquoise-700"
      />
    </svg>
  );
};

/**
 * Parse WKT string using @loaders.gl/wkt and extract coordinate rings
 */
function parseWkt(wkt: string): Point[][] {
  try {
    const geometry = parseSync(wkt, WKTLoader);

    if (!geometry || !("coordinates" in geometry)) {
      return [];
    }

    const coords = geometry.coordinates as number[][][] | number[][][][];

    if (geometry.type === "Polygon") {
      // Polygon: [[[x, y], [x, y], ...]]
      return (coords as number[][][]).map((ring) =>
        ring.map(([x, y]) => ({ x, y }))
      );
    }

    if (geometry.type === "MultiPolygon") {
      // MultiPolygon: [[[[x, y], ...]], [[[x, y], ...]]]
      return (coords as number[][][][]).flatMap((polygon) =>
        polygon.map((ring) => ring.map(([x, y]) => ({ x, y })))
      );
    }

    return [];
  } catch {
    return [];
  }
}
