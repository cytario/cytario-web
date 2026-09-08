import React, { createContext, useContext, useEffect, useState } from "react";
import { create, StoreApi, UseBoundStore, useStore } from "zustand";
import { devtools, persist } from "zustand/middleware";

import type { PillarId } from "~/utils/pillars";

interface SectionStore {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

export function createSectionStore(pillarId: PillarId) {
  return create<SectionStore>()(
    persist(
      devtools(
        (set) => ({
          isOpen: true,
          setIsOpen: (isOpen: boolean) => set({ isOpen }),
        }),
        { name: pillarId },
      ),
      // SSR: render the default on server + first client paint, then rehydrate
      // from localStorage in an effect (same pattern as createSidebarStore).
      { name: pillarId, skipHydration: true },
    ),
  );
}

const SectionStoreContext = createContext<UseBoundStore<StoreApi<SectionStore>> | null>(null);

export function SectionStoreProvider({
  pillarId,
  children,
}: {
  pillarId: PillarId;
  children: React.ReactNode;
}) {
  const [store] = useState(() => createSectionStore(pillarId));
  useEffect(() => {
    void store.persist.rehydrate();
  }, [store]);
  return <SectionStoreContext.Provider value={store}>{children}</SectionStoreContext.Provider>;
}

// export function useSectionStore() {
export const useSectionStore = <T,>(selector: (state: SectionStore) => T): T => {
  const store = useContext(SectionStoreContext);
  if (!store) throw new Error("useSectionStore must be used within a SectionStoreProvider");
  return useStore(store, selector);
};
