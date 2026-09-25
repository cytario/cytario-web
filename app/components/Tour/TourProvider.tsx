import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { STATUS, useJoyride, type BeforeHook, type Step } from "react-joyride";
import { useLocation, useNavigate, useRouteLoaderData } from "react-router";

import { GETTING_STARTED_TOUR_ID, type TourDefinition } from "./tourRegistry";
import { tourRegistry } from "./tours/registry";
import { useTourControllerStore } from "./useTourController";
import { useTourProgressStore } from "./useTourProgress";
import { normaliseAppShell, waitForTarget } from "./useTourTarget";
import { useCurrentUser } from "~/hooks/useCurrentUser";

/** Auto-start waits for hydration + route settle (two-phase client loaders, S3 probes). */
const AUTOSTART_DELAY_MS = 1500;
/** Steps wait for their target — the viewer's channel init can take many seconds. */
const TARGET_WAIT_MS = 30000;
/** Above the header (z-20), floating panels (z-40..49) and viewer chrome (z-50). */
const TOUR_Z_INDEX = 150;

interface ActiveTour {
  definition: TourDefinition;
}

interface ProtectedLayoutData {
  connectionConfigs?: unknown[];
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

  const hasAutoStartedRef = useRef(false);
  useEffect(() => {
    if (!sub || hasAutoStartedRef.current) return;
    const candidate = tourRegistry.find(
      (tour) =>
        tour.shouldAutoStart({
          pathname: location.pathname,
          leafName: location.pathname.split("/").filter(Boolean).pop() ?? "",
          connectionCount,
        }) && !isComplete(sub, tour.id),
    );
    if (!candidate) return;
    const timer = setTimeout(() => {
      hasAutoStartedRef.current = true;
      setActiveTour((current) => current ?? { definition: candidate });
    }, AUTOSTART_DELAY_MS);
    return () => clearTimeout(timer);
  }, [sub, location.pathname, connectionCount, isComplete, activeTour]);

  const navigateRef = useRef(navigate);
  useEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);

  const decoratedSteps = useMemo<Step[]>(() => {
    if (!activeTour) return [];
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
        await waitForTarget([target], TARGET_WAIT_MS);
        if (userBefore) await userBefore(data);
      };

      return { ...step, before, data: step.data };
    });
  }, [activeTour]);

  const joyride = useJoyride({
    run: Boolean(activeTour),
    steps: decoratedSteps,
    continuous: true,
    options: {
      zIndex: TOUR_Z_INDEX,
      targetWaitTimeout: TARGET_WAIT_MS,
      beforeTimeout: TARGET_WAIT_MS,
      showProgress: true,
      spotlightPadding: 6,
      buttons: ["close", "primary"],
      overlayColor: "rgba(0, 0, 0, 0.55)",
    },
    styles: {
      tooltipContainer: { fontFamily: "var(--font-montserrat)" },
    },
  });

  const completionRef = useRef(false);
  useEffect(() => {
    if (!activeTour || !sub) return;
    const status = joyride.state.status;
    if (status !== STATUS.FINISHED && status !== STATUS.SKIPPED) return;
    if (completionRef.current) return;
    completionRef.current = true;
    completeTour(sub, activeTour.definition.id);
    setActiveTour(null);
  }, [joyride.state.status, activeTour, sub, completeTour]);

  return (
    <>
      {children}
      {joyride.Tour}
    </>
  );
}
