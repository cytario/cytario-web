import { useViewerStore } from "../state/store/core/ViewerStoreContext";
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
 * Whether the current user's grant on the viewer's connection permits annotation
 * authoring. S3 remains the enforcement boundary; this only keeps the UI from
 * offering actions that cannot persist.
 */
export function useCanAnnotate(): boolean {
  const resourceId = useViewerStore((s) => s.id);
  const { connectionId } = parseResourceId(resourceId);
  const accessLevel = useConnectionsStore(
    (s) => s.connections[connectionId]?.provider?.accessLevel ?? "read-only",
  );
  return accessLevel !== "read-only";
}

/**
 * Same writable check as {@link useCanAnnotate}, for consumers outside the
 * viewer tree that already hold the resource id. Fails closed until the
 * connections store hydrates.
 */
export function useCanWrite(resourceId: string): boolean {
  // No parseResourceId: it throws on a connection-less id, which hooks must
  // never do — an unparseable id simply fails closed.
  const slashIndex = resourceId.indexOf("/");
  const connectionId = slashIndex === -1 ? "" : resourceId.slice(0, slashIndex);
  const accessLevel = useConnectionsStore(
    (s) => s.connections[connectionId]?.provider?.accessLevel ?? "read-only",
  );
  return accessLevel !== "read-only";
}
