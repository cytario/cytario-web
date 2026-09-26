import { getFileCategory } from "~/utils/fileType";

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
  /** Short label for the Help menu's replay entry; the tour's own name. */
  menuLabel: string;
  steps: import("react-joyride").Step[];
  /**
   * Whether the tour may run unprompted on a first qualified visit. Distinct
   * from {@link TourDefinition.isAvailable}: the getting-started tour is
   * replayable everywhere but only auto-starts where it has targets.
   */
  shouldAutoStart: (context: TourContext) => boolean;
  /**
   * Whether the Help menu offers a replay entry for this tour right now. The
   * menu derives its entries from the registry, so a new tour appears there
   * without a Help-menu change.
   */
  isAvailable: (context: TourContext) => boolean;
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

/** True when the pathname is a single-file image, i.e. the viewer's route. */
export function isImageViewerRoute(pathname: string, leafName: string): boolean {
  return isResourcePath(pathname) && getFileCategory(leafName) === "image";
}
