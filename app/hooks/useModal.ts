import { useCallback, useRef } from "react";
import { useSearchParams } from "react-router";

import type { ModalName } from "~/routes/layouts/ModalOutlet";

/**
 * `openModal` pushes a history entry (browser back closes the modal) and
 * captures the active element; `closeModal` replaces the entry and restores
 * focus.
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
