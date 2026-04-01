import { lazy, Suspense, type ComponentType } from "react";

import { useModal } from "~/hooks/useModal";

export type ModalName = keyof typeof MODAL_REGISTRY;

type ModalComponent = ComponentType<{ onClose: (extraKeys?: string[]) => void }>;

/**
 * Maps `?modal=<name>` values to lazy-loaded modal components.
 * Add new entries here to register search-param-driven modals.
 */
const MODAL_REGISTRY = {
  "add-connection": lazy(
    () => import("~/routes/connections/createConnection.modal"),
  ),
  "convert-overlay": lazy(
    () => import("~/components/DataGrid/ConvertOverlay.modal"),
  ),
  "edit-connection": lazy(
    () => import("~/routes/connections/updateConnection.modal"),
  ),
  "directory-info": lazy(
    () => import("~/components/DirectoryView/modals/DirectoryInfo.modal"),
  ),
  "file-info": lazy(
    () => import("~/components/DirectoryView/modals/FileInfo.modal"),
  ),
  cyberduck: lazy(
    () => import("~/components/DirectoryView/modals/Cyberduck.modal"),
  ),
} satisfies Record<string, ModalComponent>;

/**
 * Centralized mount point for search-param-driven modals.
 * Reads `?modal=<name>` and renders the matching component from the registry.
 */
export function ModalOutlet() {
  const { modalName, closeModal } = useModal();

  if (!modalName || !(modalName in MODAL_REGISTRY)) return null;

  const Component = MODAL_REGISTRY[modalName as ModalName];

  return (
    <Suspense>
      <Component onClose={closeModal} />
    </Suspense>
  );
}
