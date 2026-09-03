import { useViewerStore } from "../state/store/ViewerStoreContext";
import { useConnectionsStore } from "~/utils/connectionsStore/useConnectionsStore";
import { parseResourceId } from "~/utils/resourceId";

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
