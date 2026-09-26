import { GETTING_STARTED_TOUR_ID, isResourcePath, type TourDefinition } from "../tourRegistry";
import { getFileCategory } from "~/utils/fileType";

/**
 * The connection root row in the sidebar tree. Present on every protected
 * route (the sidebar selects the route's connection, or the first one), so it
 * is the reliable "step into a connection" target.
 */
const SIDEBAR_CONNECTION_LINK = '#navigation-sidebar a[href^="/connections/"]';

/** A folder or file inside the browsed connection — the content area. */
const CONTENT_ENTRY_LINK = 'main a[href^="/connections/"]';

export const gettingStartedTour: TourDefinition = {
  id: GETTING_STARTED_TOUR_ID,
  title: "Getting started with Cytario",
  steps: [
    {
      target: "body",
      placement: "center",
      title: "Welcome to Cytario",
      content:
        "Cytario is your workspace for browsing and viewing scientific imaging data. " +
        "This quick tour shows you around — it takes about a minute.",
    },
    {
      target: "#navigation-sidebar",
      // Full-height element — a bottom/top anchor would push the tooltip off-screen.
      placement: "right",
      content:
        "The navigation panel is your starting point. Your connections, favorites, " +
        "and recently viewed images live here.",
    },
    {
      target: 'button[data-expander][aria-controls="section-connections-content"]',
      title: "Connections",
      content:
        "Connections link Cytario to your cloud storage buckets. Every image and " +
        "folder you browse comes from one of them.",
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
      title: "Open a connection",
      content: "Click a connection to open it. Inside you'll find the folders and images it holds.",
      data: { enterConnectionVia: SIDEBAR_CONNECTION_LINK },
    },
    {
      target: 'nav[aria-label="Breadcrumb"]',
      content: "Breadcrumbs show where you are. Click any crumb to jump back up the folder tree.",
    },
    {
      target: '[role="radiogroup"][aria-label="View mode"]',
      content: "Switch between grid and list views to browse the way you prefer.",
    },
    {
      target: CONTENT_ENTRY_LINK,
      title: "Open an image",
      content:
        "Open anything here to browse deeper. Images open in the full viewer — " +
        "where a second short tour will show you the viewing controls.",
    },
    {
      target: 'button[aria-label="Help"]',
      content: "Anytime you want a refresher, replay this tour from the Help menu.",
    },
  ],
  // App-shell tour: never claims a single-file image route — the viewer tour
  // owns those, and the registry would otherwise pick this one first.
  shouldAutoStart: ({ pathname, leafName, connectionCount }) =>
    connectionCount > 0 && !(isResourcePath(pathname) && getFileCategory(leafName) === "image"),
  // App-shell targets either exist once the route has settled or never will
  // (an empty connection has no file entries) — a long wait would only spin.
  targetWaitMs: 5000,
};
