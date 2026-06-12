import React, { createContext, useContext, useState } from "react";
import { create, StoreApi, UseBoundStore, useStore } from "zustand";
import { devtools, persist } from "zustand/middleware";

interface FeatureItemStore {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

export function createFeatureItemStore(name: string) {
  return create<FeatureItemStore>()(
    persist(
      devtools(
        (set) => ({
          isOpen: false,
          setIsOpen: (isOpen: boolean) => set({ isOpen }),
        }),
        { name },
      ),
      { name },
    ),
  );
}

const FeatureItemStoreContext = createContext<UseBoundStore<StoreApi<FeatureItemStore>> | null>(
  null,
);

export function FeatureItemStoreProvider({
  name,
  children,
}: {
  name: string;
  children: React.ReactNode;
}) {
  const [store] = useState(() => createFeatureItemStore(name));
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
