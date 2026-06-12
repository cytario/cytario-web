import React, { createContext, useContext, useEffect, useState } from "react";
import { create, StoreApi, UseBoundStore, useStore } from "zustand";
import { devtools, persist } from "zustand/middleware";

interface FeatureItemStore {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

export function createFeatureItemStore(name: string, defaultOpen = false) {
  return create<FeatureItemStore>()(
    persist(
      devtools(
        (set) => ({
          isOpen: defaultOpen,
          setIsOpen: (isOpen: boolean) => set({ isOpen }),
        }),
        { name },
      ),
      // SSR: render the default on server + first client paint, then rehydrate
      // from localStorage in an effect (same pattern as createSidebarStore).
      { name, skipHydration: true },
    ),
  );
}

const FeatureItemStoreContext = createContext<UseBoundStore<StoreApi<FeatureItemStore>> | null>(
  null,
);

export function FeatureItemStoreProvider({
  name,
  defaultOpen,
  children,
}: {
  name: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [store] = useState(() => createFeatureItemStore(name, defaultOpen));
  useEffect(() => {
    void store.persist.rehydrate();
  }, [store]);
  return (
    <FeatureItemStoreContext.Provider value={store}>{children}</FeatureItemStoreContext.Provider>
  );
}

// export function useFeatureItemStore() {
export const useFeatureItemStore = <T,>(selector: (state: FeatureItemStore) => T): T => {
  const store = useContext(FeatureItemStoreContext);
  if (!store) throw new Error("useFeatureItemStore must be used within a FeatureItemStoreProvider");
  return useStore(store, selector);
};
