import { VIEWER_TOUR_ID, type TourDefinition } from "../tourRegistry";
import { getFileCategory } from "~/utils/fileType";

export const viewerTour: TourDefinition = {
  id: VIEWER_TOUR_ID,
  title: "Viewing controls",
  steps: [
    {
      target: "#image-controls-sidebar",
      content:
        "This panel holds the viewing controls — channels, zoom, and display settings. " +
        "It can be docked here or floated over the image.",
    },
    {
      target: "#section-channels-title",
      title: "Channels",
      content:
        "Each channel is one imaging modality or fluorophore. Toggle channels on and off, " +
        "pick their colors, and set brightness and contrast per channel.",
    },
    {
      target: "#min-contrast",
      title: "Brightness and contrast",
      content:
        "The min and max values stretch each channel's range — lower them to brighten, " +
        "raise them to sharpen contrast.",
    },
    {
      target: '[role="radiogroup"][aria-label="Magnification presets"]',
      title: "Magnification",
      content:
        "Jump to a preset magnification, or read the exact current value in the field beside it.",
    },
    {
      target: "#section-settings-title",
      title: "Display settings",
      content: "Show or hide the scale bar and rulers, and choose metric or pixel units.",
    },
    {
      target: "#image-controls-toggle",
      content: "Collapse the controls panel to view the image full-width, and reopen it here.",
    },
  ],
  // Gated on the route's own single-file image category so the tour runs exactly
  // where the image viewer chrome exists.
  shouldAutoStart: ({ pathname, leafName }) =>
    /^\/connections\/[^/]+\/.+/.test(pathname) && getFileCategory(leafName) === "image",
  // The viewer chrome only renders after the loader and the settings-sidecar
  // round-trip resolve, which can take many seconds on a cold S3 path.
  targetWaitMs: 30000,
};
