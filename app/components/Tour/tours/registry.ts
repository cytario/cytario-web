import { gettingStartedTour } from "./gettingStarted.tour";
import { viewerTour } from "./viewer.tour";
import type { TourDefinition } from "../tourRegistry";

/** Auto-start order: the app tour first; the viewer tour hands off from it. */
export const tourRegistry: TourDefinition[] = [gettingStartedTour, viewerTour];
