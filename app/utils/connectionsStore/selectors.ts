import { ConnectionsStore } from "./useConnectionsStore";

export const select = {
  connections: (state: ConnectionsStore) => state.connections,
  setConnection: (state: ConnectionsStore) => state.setConnection,
  clearConnection: (state: ConnectionsStore) => state.clearConnection,
  clearAll: (state: ConnectionsStore) => state.clearAll,
};

export const selectConnection = (key: string) => (state: ConnectionsStore) =>
  state.connections[key] ?? null;

export const selectCredentials = (key: string) => (state: ConnectionsStore) =>
  state.connections[key]?.credentials ?? null;

export const selectBucketConfig = (key: string) => (state: ConnectionsStore) =>
  state.connections[key]?.bucketConfig ?? null;
