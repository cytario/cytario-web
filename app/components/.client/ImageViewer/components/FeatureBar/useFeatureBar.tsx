import React, { createContext, useContext, useState } from "react";
import { create, StoreApi, UseBoundStore, useStore } from "zustand";
import { devtools, persist } from "zustand/middleware";

interface FeatureItemStore {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

type FeatureBarListStyle = "list" | "grid";

interface ControlBarStore {
  width: number;
  minWidth: Readonly<number>;
  maxWidth: Readonly<number>;
  setWidth: (width: number) => void;
  listStyle: FeatureBarListStyle;
  setListStyle: (listStyle: FeatureBarListStyle) => void;
  showCellOutline: boolean;
  setShowCellOutline: (show: boolean) => void;
  pixelValues: Record<string, number>;
  setPixelValues: (ids: string[], values: number[]) => void;
  isExpanded: boolean;
  setIsExpanded: (isExpanded: boolean) => void;
}

const name = "FeatureBar";

export const useFeatureBarStore = create<ControlBarStore>()(
  persist(
    devtools(
      (set) => ({
        width: 320,
        minWidth: 320,
        maxWidth: 720,
        setWidth: (width: number) => set({ width }, false, "setWidth"),
        listStyle: "grid",
        setListStyle: (listStyle: FeatureBarListStyle) =>
          set({ listStyle }, false, "setListStyle"),
        showCellOutline: true,
        setShowCellOutline: (showCellOutline: boolean) =>
          set({ showCellOutline }, false, "setShowCellOutline"),
        pixelValues: {},
        setPixelValues: (ids: string[], values: number[]) =>
          set(
            (state) => ({
              pixelValues: ids.reduce(
                (acc, id, index) => {
                  acc[id] = values[index];
                  return acc;
                },
                { ...state.pixelValues }
              ),
            }),
            false,
            "setPixelValues"
          ),
        isExpanded: true,
        setIsExpanded: (isExpanded: boolean) =>
          set({ isExpanded }, false, "setIsExpanded"),
      }),
      { name, actionsBlacklist: ["setPixelValues"] }
    ),
    { name }
  )
);

export function createFeatureItemStore(name: string) {
  return create<FeatureItemStore>()(
    persist(
      devtools(
        (set) => ({
          isOpen: false,
          setIsOpen: (isOpen: boolean) => set({ isOpen }),
        }),
        { name }
      ),
      { name }
    )
  );
}

const FeatureItemStoreContext = createContext<UseBoundStore<
  StoreApi<FeatureItemStore>
> | null>(null);

export function FeatureItemStoreProvider({
  name,
  children,
}: {
  name: string;
  children: React.ReactNode;
}) {
  const [store] = useState(() => createFeatureItemStore(name));
  return (
    <FeatureItemStoreContext.Provider value={store}>
      {children}
    </FeatureItemStoreContext.Provider>
  );
}

// export function useFeatureItemStore() {
export const useFeatureItemStore = <T,>(
  selector: (state: FeatureItemStore) => T
): T => {
  const store = useContext(FeatureItemStoreContext);
  if (!store)
    throw new Error(
      "useFeatureItemStore must be used within a FeatureItemStoreProvider"
    );
  return useStore(store, selector);
};
