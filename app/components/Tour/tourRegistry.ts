import { getFileCategory } from "~/utils/fileType";

export const GETTING_STARTED_TOUR_ID = "getting-started";
export const VIEWER_TOUR_ID = "viewer";
export const USER_MANAGEMENT_TOUR_ID = "user-management";

/**
 * The breadcrumb's organization switcher trigger. Qualified by the route, since
 * the tour's spotlight otherwise matches any `Building2` button.
 */
export const ORG_SWITCHER_SELECTOR =
  'nav[aria-label="Breadcrumb"] button[aria-label="Switch organization"]';

/** Context the registry gets to decide whether a tour should auto-start. */
export interface TourContext {
  /** `location.pathname` — viewer pages are `/:org/:id/...` files. */
  pathname: string;
  /** Last path segment, e.g. `slide.ome.tiff` — the resource's name. */
  leafName: string;
  /** Connection count from the protected-layout loader (SSR-safe; the
   *  connections zustand store fills in an effect and reads empty first paint). */
  connectionCount: number;
  /** The user's admin scopes (empty for plain members); the first is the
   *  user-management screen's default scope. Includes the `*` org-root
   *  sentinel for org admins. */
  adminScopes: readonly string[];
  /** How many organizations the user belongs to; the switcher only renders
   *  for more than one. */
  organizationCount?: number;
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

/** True when the pathname points at a single resource inside a connection.
 *  The organization prefix is optional so the helper keeps working for callers
 *  that hold an already-stripped path. */
export function isResourcePath(pathname: string): boolean {
  return /^(?:\/o\/[^/]+)?\/connections\/[^/]+\/.+/.test(pathname);
}

/** True when the pathname is a single-file image, i.e. the viewer's route. */
export function isImageViewerRoute(pathname: string, leafName: string): boolean {
  return isResourcePath(pathname) && getFileCategory(leafName) === "image";
}

/**
 * The steps this run may show. A step whose target cannot exist in this context
 * is dropped rather than left to fail its target wait: joyride would mark it
 * failed and advance after `targetWaitTimeout`, stalling the tour for seconds on
 * a screen the step never applied to.
 */
export function visibleSteps(definition: TourDefinition, context: TourContext) {
  return definition.steps.filter(
    (step) => !step.data?.requiresMultipleOrgs || (context.organizationCount ?? 0) > 1,
  );
}
