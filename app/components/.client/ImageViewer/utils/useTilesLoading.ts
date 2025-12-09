import { useRef, useCallback } from "react";

export const useTilesLoading = (
  imagePanelId: number,
  setIsTilesLoading: (imagePanelId: number, count: number) => void
) => {
  const loadingSet = useRef(new Set<string>());

  // Tile loading state
  const loadTile = useCallback(
    (id: string) => {
      loadingSet.current.add(id);
      setIsTilesLoading(imagePanelId, loadingSet.current.size);
    },
    [imagePanelId, setIsTilesLoading]
  );

  const finishTile = useCallback(
    (id: string) => {
      loadingSet.current.delete(id);
      setIsTilesLoading(imagePanelId, loadingSet.current.size);
    },
    [imagePanelId, setIsTilesLoading]
  );

  return { loadTile, finishTile };
};
