import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { EVENTS, useJoyride, type BeforeHook, type EventData, type Step } from "react-joyride";
import { useLocation, useNavigate, useRouteLoaderData } from "react-router";

import { GETTING_STARTED_TOUR_ID, type TourDefinition } from "./tourRegistry";
import { tourRegistry } from "./tours/registry";
import { useTourControllerStore } from "./useTourController";
import { useTourProgressStore } from "./useTourProgress";
import { normaliseAppShell, navigateToFirstMatch, waitForTarget } from "./useTourTarget";
import { useCurrentUser } from "~/hooks/useCurrentUser";

/** Auto-start waits for hydration + route settle (two-phase client loaders, S3 probes). */
const AUTOSTART_DELAY_MS = 1500;
/** Steps wait for their target — the viewer's channel init can take many seconds. */
const TARGET_WAIT_MS = 30000;
/** Above the header (z-20), floating panels (z-40..49) and viewer chrome (z-50). */
const TOUR_Z_INDEX = 150;
/** Runtime opt-out for automated harnesses that clear localStorage (e2e state resets). */
export const TOURS_DISABLED_STORAGE_KEY = "cytario-tours-disabled";

interface ActiveTour {
  definition: TourDefinition;
}

interface ProtectedLayoutData {
  connectionConfigs?: unknown[];
}

/** A blocked localStorage must read as "not disabled", never crash the provider. */
function isTourAutoStartSuppressed(): boolean {
  try {
    return window.localStorage.getItem(TOURS_DISABLED_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function TourProvider({ children }: { children?: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const user = useCurrentUser();
  const sub = user?.sub ?? null;

  // Loader data, not the connections store: the store is empty during SSR and
  // would report no connections on first paint.
  const protectedData = useRouteLoaderData<ProtectedLayoutData>("routes/layouts/protected.layout");
  const connectionCount = protectedData?.connectionConfigs?.length ?? 0;

  const isComplete = useTourProgressStore((state) => state.isComplete);
  const completeTour = useTourProgressStore((state) => state.completeTour);

  const [activeTour, setActiveTour] = useState<ActiveTour | null>(null);

  // Manual replay requests (Help menu) start immediately, completed or not.
  const requestedTourId = useTourControllerStore((state) => state.requestedTourId);
  const consumeRequest = useTourControllerStore((state) => state.consumeRequest);
  useEffect(() => {
    if (!requestedTourId) return;
    const definition = tourRegistry.find((tour) => tour.id === requestedTourId);
    consumeRequest();
    if (definition) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveTour({ definition });
    }
  }, [requestedTourId, consumeRequest]);

  // One auto-start per tour id per session: a completed getting-started run
  // must not consume the viewer tour's only auto-start.
  const autoStartedTourIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!sub || isTourAutoStartSuppressed()) return;
    const candidate = tourRegistry.find(
      (tour) =>
        !autoStartedTourIdsRef.current.has(tour.id) &&
        tour.shouldAutoStart({
          pathname: location.pathname,
          leafName: location.pathname.split("/").filter(Boolean).pop() ?? "",
          connectionCount,
        }) &&
        !isComplete(sub, tour.id),
    );
    if (!candidate) return;
    const timer = setTimeout(() => {
      autoStartedTourIdsRef.current.add(candidate.id);
      setActiveTour((current) => current ?? { definition: candidate });
    }, AUTOSTART_DELAY_MS);
    return () => clearTimeout(timer);
  }, [sub, location.pathname, connectionCount, isComplete]);

  const navigateRef = useRef(navigate);
  useEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);

  const decoratedSteps = useMemo<Step[]>(() => {
    if (!activeTour) return [];
    const targetWaitMs = activeTour.definition.targetWaitMs ?? TARGET_WAIT_MS;
    return activeTour.definition.steps.map((step) => {
      const target = typeof step.target === "string" ? step.target : null;
      if (!target || target === "body") return { ...step, data: step.data };

      const userBefore = step.before;
      const before: BeforeHook = async (data) => {
        if (step.data?.navigateTo) {
          navigateRef.current(step.data.navigateTo);
        }
        if (activeTour.definition.id === GETTING_STARTED_TOUR_ID && data.index === 1) {
          await normaliseAppShell();
        }
        // Breadcrumb and view-mode targets only exist inside a connection, so
        // this step steps the user into one before they are highlighted.
        if (step.data?.enterConnectionVia) {
          await navigateToFirstMatch(step.data.enterConnectionVia, navigateRef.current);
        }
        await waitForTarget([target], targetWaitMs);
        if (userBefore) await userBefore(data);
      };

      return { ...step, before, data: step.data };
    });
  }, [activeTour]);

  // joyride's FINISHED/SKIPPED statuses are transient (reset() lands on READY
  // right after TOUR_END), so completion is captured from the TOUR_END event
  // — polling state would miss the transition.
  const handleTourEvent = (data: EventData) => {
    if (data.type !== EVENTS.TOUR_END) return;
    if (!activeTour || !sub) return;
    completeTour(sub, activeTour.definition.id);
    setActiveTour(null);
  };

  const joyride = useJoyride({
    run: Boolean(activeTour),
    steps: decoratedSteps,
    continuous: true,
    onEvent: handleTourEvent,
    options: {
      zIndex: TOUR_Z_INDEX,
      targetWaitTimeout: activeTour?.definition.targetWaitMs ?? TARGET_WAIT_MS,
      beforeTimeout: TARGET_WAIT_MS,
      showProgress: true,
      spotlightPadding: 6,
      buttons: ["close", "primary"],
      // The tooltip close button dismisses the whole tour, not just the step —
      // default "close" would advance to the next step instead.
      closeButtonAction: "skip",
      // Auto-started onboarding: tooltips render directly instead of waiting
      // for a beacon click the user does not know to make.
      skipBeacon: true,
      // The app shell is a fixed-height layout (body is h-screen
      // overflow-hidden), so the document must never scroll. Joyride animates
      // documentElement.scrollTop to bring its target into view, which shifts
      // the header out of the viewport.
      skipScroll: true,
      overlayColor: "rgba(0, 0, 0, 0.55)",
    },
    styles: {
      tooltipContainer: { fontFamily: "var(--font-montserrat)" },
    },
  });

  return (
    <>
      {children}
      {joyride.Tour}
    </>
  );
}
