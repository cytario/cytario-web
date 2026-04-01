import { useCallback, useRef } from "react";
import { useSearchParams } from "react-router";

import type { ModalName } from "~/routes/layouts/ModalOutlet";

/**
 * Hook for opening and closing search-param-driven modals.
 *
 * - `openModal` pushes a history entry so the browser back button closes the modal.
 *   Extra `params` are stored as search params alongside `?modal=<name>`.
 *   Captures the active element so focus can be restored on close.
 * - `closeModal` replaces the current entry (no extra history) and removes
 *   `modal` plus any extra keys added by `openModal` in a single navigation.
 *   Restores focus to the element that triggered the modal.
 */
export function useModal() {
  const [searchParams, setSearchParams] = useSearchParams();
  const triggerRef = useRef<HTMLElement | null>(null);

  const modalName = (searchParams.get("modal") ?? null) as ModalName | null;

  const openModal = useCallback(
    (name: ModalName, params?: Record<string, string>) => {
      triggerRef.current = document.activeElement as HTMLElement | null;
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
      requestAnimationFrame(() => triggerRef.current?.focus());
    },
    [setSearchParams],
  );

  return { modalName, openModal, closeModal } as const;
}
