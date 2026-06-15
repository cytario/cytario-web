import type { ViewState } from "../state/store/types";
import { VIEW_STATE_PARAM } from "~/utils/viewStateParam";

export { VIEW_STATE_PARAM };

/** Serializes the viewport portion of a view state to "zoom,x,y". */
export const encodeViewState = (vs: Pick<ViewState, "zoom" | "target">): string => {
  const zoom = Number(vs.zoom.toFixed(3));
  const [x, y] = vs.target;
  return `${zoom},${Math.round(x)},${Math.round(y)}`;
};

/** Parses "zoom,x,y" back to a viewport. Returns null if missing or malformed. */
export const decodeViewState = (
  raw: string | null,
): { zoom: number; target: [number, number] } | null => {
  if (!raw) return null;

  const parts = raw.split(",");
  if (parts.length !== 3) return null;

  const zoom = Number(parts[0]);
  const x = Number(parts[1]);
  const y = Number(parts[2]);

  if (!Number.isFinite(zoom) || !Number.isFinite(x) || !Number.isFinite(y)) return null;

  return { zoom, target: [x, y] };
};
