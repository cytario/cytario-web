import { create } from "zustand";

interface TourControllerState {
  /** Tour id requested for manual replay, consumed by the TourProvider. */
  requestedTourId: string | null;
  requestTour: (tourId: string) => void;
  consumeRequest: () => string | null;
  /**
   * The Help menu opens itself when this flips — set when the getting-started
   * tour is finished (not skipped), so the user sees where the other tours
   * live. Consumed by the HelpMenu.
   */
  helpMenuRevealSignal: number;
  signalHelpMenuReveal: () => void;
}

/** Non-persisted bridge between the Help menu and the mounted TourProvider. */
export const useTourControllerStore = create<TourControllerState>()((set, get) => ({
  requestedTourId: null,
  requestTour: (tourId) => set({ requestedTourId: tourId }),
  consumeRequest: () => {
    const requestedTourId = get().requestedTourId;
    if (requestedTourId) set({ requestedTourId: null });
    return requestedTourId;
  },
  helpMenuRevealSignal: 0,
  signalHelpMenuReveal: () =>
    set((state) => ({ helpMenuRevealSignal: state.helpMenuRevealSignal + 1 })),
}));

export function useTourController() {
  const startTour = useTourControllerStore((state) => state.requestTour);
  return { startTour };
}
