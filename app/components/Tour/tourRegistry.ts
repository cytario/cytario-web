export const GETTING_STARTED_TOUR_ID = "getting-started";
export const VIEWER_TOUR_ID = "viewer";

/** Context the registry gets to decide whether a tour should auto-start. */
export interface TourContext {
  /** `location.pathname` — viewer pages are `/connections/:id/...` image files. */
  pathname: string;
  /** Last path segment, e.g. `slide.ome.tiff` — the resource's name. */
  leafName: string;
  /** Connection count from the protected-layout loader (SSR-safe; the
   *  connections zustand store fills in an effect and reads empty first paint). */
  connectionCount: number;
}

export interface TourDefinition {
  id: string;
  title: string;
  steps: import("react-joyride").Step[];
  shouldAutoStart: (context: TourContext) => boolean;
  /**
   * How long a step waits for its target before joyride skips it. Defaults to
   * the provider's value; the viewer tour needs far longer than the app tour
   * because its chrome waits on an S3 sidecar round-trip.
   */
  targetWaitMs?: number;
}

/** Last path segment of a pathname, decoded — the resource's display name. */
export function leafNameOf(pathname: string): string {
  const leaf = pathname.split("/").filter(Boolean).pop() ?? "";
  try {
    return decodeURIComponent(leaf);
  } catch {
    return leaf;
  }
}

/** True when the pathname points at a single resource inside a connection. */
export function isResourcePath(pathname: string): boolean {
  return /^\/connections\/[^/]+\/.+/.test(pathname);
}
