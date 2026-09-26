import { create } from "zustand";

interface TourControllerState {
  /** Tour id requested for manual replay, consumed by the TourProvider. */
  requestedTourId: string | null;
  requestTour: (tourId: string) => void;
  consumeRequest: () => string | null;
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
}));

export function useTourController() {
  const startTour = useTourControllerStore((state) => state.requestTour);
  return { startTour };
}
