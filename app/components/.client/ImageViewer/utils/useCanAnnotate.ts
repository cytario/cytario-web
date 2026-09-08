import { useViewerStore } from "../state/store/ViewerStoreContext";
import { useConnectionsStore } from "~/utils/connectionsStore/useConnectionsStore";
import { parseResourceId } from "~/utils/resourceId";

/**
 * Whether the connection's grant is read-only. Reads the connections store
 * imperatively for non-React callers; fails closed when the store has not
 * hydrated the connection yet.
 */
export function connectionIsReadOnly(resourceId: string): boolean {
  const { connectionId } = parseResourceId(resourceId);
  const accessLevel =
    useConnectionsStore.getState().connections[connectionId]?.provider?.accessLevel ?? "read-only";
  return accessLevel === "read-only";
}

/**
 * Whether the current user's grant on the viewer's connection permits
 * annotation authoring (any access level above read-only). Gates the
 * authoring UI — S3 remains the enforcement boundary; this only keeps
 * the UI from offering actions that cannot persist.
 */
export function useCanAnnotate(): boolean {
  const resourceId = useViewerStore((s) => s.id);
  const { connectionId } = parseResourceId(resourceId);
  const accessLevel = useConnectionsStore(
    (s) => s.connections[connectionId]?.provider?.accessLevel ?? "read-only",
  );
  return accessLevel !== "read-only";
}
