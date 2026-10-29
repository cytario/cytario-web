import {
  GETTING_STARTED_TOUR_ID,
  ORG_SWITCHER_SELECTOR,
  isImageViewerRoute,
  type TourDefinition,
} from "../tourRegistry";

/**
 * The connection root row in the sidebar tree. Present on every protected
 * route (the sidebar selects the route's connection, or the first one), so it
 * is the reliable "step into a connection" target. The `*=` match keeps it
 * prefix-agnostic: connection links live under the URL's organization.
 */
const SIDEBAR_CONNECTION_LINK = '#navigation-sidebar a[href*="/connections/"]';

/**
 * A folder or file inside the browsed connection. Scoped to the content
 * area's <section>: the sidebar tree holds the same link shape, so an
 * unscoped `main a[…]` resolves to the navigation panel instead.
 */
const CONTENT_ENTRY_LINK = 'main section a[href*="/connections/"]';

export const gettingStartedTour: TourDefinition = {
  id: GETTING_STARTED_TOUR_ID,
  title: "Getting started with cytario",
  menuLabel: "Getting started tour",
  steps: [
    {
      target: "body",
      placement: "center",
      title: "Welcome to cytario",
      content: "cytario is your workspace for browsing and viewing scientific imaging data. ",
    },
    {
      target: "#navigation-sidebar",
      // Full-height element — a bottom/top anchor would push the tooltip off-screen.
      placement: "right",
      title: "The navigation panel",
      content:
        "The navigation panel is your starting point. Your connections, favorites, " +
        "and recently viewed images live here.",
    },
    {
      target: 'button[data-expander][aria-controls="section-connections-content"]',
      title: "Connections",
      content:
        "Connections link your cloud storage to cytario. Every image and folder you browse " +
        "comes from one of them.",
    },
    {
      target: "#sidebar-search-input",
      content: "Search a connection's files by name to quickly find what you need.",
    },
    {
      // Targets the tree (which survives the navigation) while the before-hook
      // steps into the connection via its row link — that row stops being a
      // link once it is the current route, so it cannot be the target itself.
      target: '#navigation-sidebar [role="tree"]',
      // The tree fills the sidebar's full height, so the tooltip anchors right
      // — above it there is no room and the tooltip would clip at the viewport.
      placement: "right",
      title: "Open a connection",
      content: "Click a connection to open it. Inside you'll find the folders and images it holds.",
      data: { enterConnectionVia: SIDEBAR_CONNECTION_LINK },
    },
    {
      target: 'nav[aria-label="Breadcrumb"]',
      content: "Breadcrumbs show where you are. Click any crumb to jump back up the folder tree.",
    },
    {
      // The switcher is the breadcrumb's org root, rendered only when a second
      // org exists; the registry drops this step for single-org users.
      target: ORG_SWITCHER_SELECTOR,
      placement: "bottom",
      title: "Switch organization",
      content:
        "You belong to more than one organization. This is the active one — " +
        "switch here to work in another; everything you see follows.",
      data: { requiresMultipleOrgs: true },
    },
    {
      target: '[role="radiogroup"][aria-label="View mode"]',
      content: "Switch between grid and list views to browse the way you prefer.",
    },
    {
      target: CONTENT_ENTRY_LINK,
      title: "Open an item",
      content:
        "Open a folder here to browse deeper; open an image and it launches in the " +
        "full viewer — where a second short tour will show you the viewing controls.",
    },
    {
      target: 'button[aria-label="Help"]',
      content: "Anytime you want a refresher, replay this tour from the Help menu.",
    },
  ],
  // App-shell tour: never claims a single-file image route — the viewer tour
  // owns those, and the registry would otherwise pick this one first.
  shouldAutoStart: ({ pathname, leafName, connectionCount }) =>
    connectionCount > 0 && !isImageViewerRoute(pathname, leafName),
  // Replayable on every authenticated screen; it only needs the sidebar, which
  // is always mounted.
  isAvailable: () => true,
  // App-shell targets either exist once the route has settled or never will
  // (an empty connection has no file entries) — a long wait would only spin.
  targetWaitMs: 5000,
};
