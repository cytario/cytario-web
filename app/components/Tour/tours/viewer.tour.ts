import { VIEWER_TOUR_ID, isImageViewerRoute, type TourDefinition } from "../tourRegistry";

/**
 * The control panel is a 320px column pinned to the right edge, so a tooltip
 * anchored to its right (joyride's default `bottom` after flipping) has nowhere
 * to go — it renders past the viewport and is clipped. Anchor every step to the
 * panel's left instead, where the image canvas provides room.
 */
const PANEL_PLACEMENT = "left" as const;

export const viewerTour: TourDefinition = {
  id: VIEWER_TOUR_ID,
  title: "Viewing controls",
  menuLabel: "Viewer controls tour",
  steps: [
    {
      target: "#image-controls-sidebar",
      placement: PANEL_PLACEMENT,
      content:
        "This panel holds the viewing controls — channels, zoom, and display settings. " +
        "It can be docked here or floated over the image.",
    },
    {
      target: "#section-channels-title",
      placement: PANEL_PLACEMENT,
      title: "Channels",
      content:
        "Each channel is one imaging modality or fluorophore. Toggle channels on and off, " +
        "pick their colors, and set brightness and contrast per channel.",
    },
    {
      target: "#min-contrast",
      placement: PANEL_PLACEMENT,
      title: "Brightness and contrast",
      content:
        "The min and max values stretch each channel's range — lower them to brighten, " +
        "raise them to sharpen contrast.",
      data: { revealTarget: true },
    },
    {
      target: '[role="radiogroup"][aria-label="Magnification presets"]',
      placement: PANEL_PLACEMENT,
      title: "Magnification",
      content:
        "Jump to a preset magnification, or read the exact current value in the field beside it.",
      data: { revealTarget: true },
    },
    {
      target: "#section-settings-title",
      placement: PANEL_PLACEMENT,
      title: "Display settings",
      content: "Show or hide the scale bar and rulers, and choose metric or pixel units.",
      data: { revealTarget: true },
    },
    {
      target: "#image-controls-toggle",
      // Sits at the panel's bottom-right corner; anchoring left keeps the
      // tooltip over the image rather than past the viewport edge.
      placement: "top",
      content: "Collapse the controls panel to view the image full-width, and reopen it here.",
    },
  ],
  // Gated on the route's own single-file image category so the tour runs exactly
  // where the image viewer chrome exists.
  shouldAutoStart: ({ pathname, leafName }) => isImageViewerRoute(pathname, leafName),
  // Offered only while an image is actually open, since every step targets the
  // viewer's control panel.
  isAvailable: ({ pathname, leafName }) => isImageViewerRoute(pathname, leafName),
  // The viewer chrome only renders after the loader and the settings-sidecar
  // round-trip resolve, which can take many seconds on a cold S3 path.
  targetWaitMs: 30000,
};
