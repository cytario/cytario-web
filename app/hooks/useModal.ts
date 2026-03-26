import { useCallback } from "react";
import { useSearchParams } from "react-router";

import type { ModalName } from "~/routes/layouts/ModalOutlet";

/**
 * Hook for opening and closing search-param-driven modals.
 *
 * - `openModal` pushes a history entry so the browser back button closes the modal.
 *   Extra `params` are stored as search params alongside `?modal=<name>`.
 * - `closeModal` replaces the current entry (no extra history) and removes
 *   `modal` plus any extra keys added by `openModal` in a single navigation.
 */
export function useModal() {
  const [searchParams, setSearchParams] = useSearchParams();

  const modalName = (searchParams.get("modal") ?? null) as ModalName | null;

  const openModal = useCallback(
    (name: ModalName, params?: Record<string, string>) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("modal", name);
          if (params) {
            for (const [k, v] of Object.entries(params)) {
              next.set(k, v);
            }
          }
          return next;
        },
        { replace: false },
      );
    },
    [setSearchParams],
  );

  const closeModal = useCallback(
    (extraKeys?: string[]) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete("modal");
          if (extraKeys) {
            for (const key of extraKeys) {
              next.delete(key);
            }
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  return { modalName, openModal, closeModal } as const;
}
