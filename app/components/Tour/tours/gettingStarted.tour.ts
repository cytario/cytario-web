import { GETTING_STARTED_TOUR_ID, type TourDefinition } from "../tourRegistry";

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
      target: 'nav[aria-label="Breadcrumb"]',
      content: "Breadcrumbs show where you are. Click any crumb to jump back up the folder tree.",
    },
    {
      target: '[role="radiogroup"][aria-label="View mode"]',
      content: "Switch between grid and list views to browse the way you prefer.",
    },
    {
      target: 'a[href^="/connections/"]',
      title: "Open an image",
      content:
        "Click a file to open it. Images open in the full viewer — where a second " +
        "short tour will show you the viewing controls.",
    },
    {
      target: 'button[aria-label="Help"]',
      content: "Anytime you want a refresher, replay this tour from the Help menu.",
    },
  ],
  shouldAutoStart: ({ connectionCount }) => connectionCount > 0,
};
