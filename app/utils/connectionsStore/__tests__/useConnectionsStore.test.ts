import {
  selectConnection,
  selectConnectionConfig,
  selectCredentials,
} from "../selectors";
import {
  useConnectionsStore,
  type ConnectionRecord,
} from "../useConnectionsStore";
import mock from "~/utils/__tests__/__mocks__";

describe("useConnectionsStore", () => {
  const credentials = mock.credentials();
  const connectionConfig = mock.connectionConfig({ alias: "test-conn" });

  beforeEach(() => {
    useConnectionsStore.setState({ connections: {} });
  });

  describe("setConnection", () => {
    test("stores credentials and connectionConfig", () => {
      useConnectionsStore
        .getState()
        .setConnection("test-conn", credentials, connectionConfig);

      const record = useConnectionsStore.getState().connections["test-conn"];
      expect(record).toBeDefined();
      expect(record.credentials).toEqual(credentials);
      expect(record.connectionConfig).toEqual(connectionConfig);
    });

    test("overwrites existing connection", () => {
      useConnectionsStore
        .getState()
        .setConnection("test-conn", credentials, connectionConfig);

      const newCredentials = mock.credentials({
        AccessKeyId: "newKey",
      });
      useConnectionsStore
        .getState()
        .setConnection("test-conn", newCredentials, connectionConfig);

      const record = useConnectionsStore.getState().connections["test-conn"];
      expect(record.credentials.AccessKeyId).toBe("newKey");
    });
  });

  describe("clearConnection", () => {
    test("removes a specific connection", () => {
      useConnectionsStore
        .getState()
        .setConnection("conn-a", credentials, connectionConfig);
      useConnectionsStore
        .getState()
        .setConnection(
          "conn-b",
          credentials,
          mock.connectionConfig({ alias: "conn-b" }),
        );

      useConnectionsStore.getState().clearConnection("conn-a");

      const connections = useConnectionsStore.getState().connections;
      expect(connections["conn-a"]).toBeUndefined();
      expect(connections["conn-b"]).toBeDefined();
    });

    test("is a no-op for nonexistent key", () => {
      useConnectionsStore
        .getState()
        .setConnection("conn-a", credentials, connectionConfig);

      useConnectionsStore.getState().clearConnection("nonexistent");

      expect(
        useConnectionsStore.getState().connections["conn-a"],
      ).toBeDefined();
    });
  });

  describe("clearAll", () => {
    test("clears all connections", () => {
      useConnectionsStore
        .getState()
        .setConnection("conn-a", credentials, connectionConfig);
      useConnectionsStore
        .getState()
        .setConnection(
          "conn-b",
          credentials,
          mock.connectionConfig({ alias: "conn-b" }),
        );

      useConnectionsStore.getState().clearAll();

      expect(useConnectionsStore.getState().connections).toEqual({});
    });
  });

  describe("selectors", () => {
    test("selectConnection returns record or null", () => {
      const state = useConnectionsStore.getState();
      expect(selectConnection("missing")(state)).toBeNull();

      useConnectionsStore
        .getState()
        .setConnection("test-conn", credentials, connectionConfig);

      const record = selectConnection("test-conn")(
        useConnectionsStore.getState(),
      );
      expect(record).not.toBeNull();
      expect((record as ConnectionRecord).credentials).toEqual(credentials);
    });

    test("selectCredentials returns credentials or null", () => {
      const state = useConnectionsStore.getState();
      expect(selectCredentials("missing")(state)).toBeNull();

      useConnectionsStore
        .getState()
        .setConnection("test-conn", credentials, connectionConfig);

      expect(
        selectCredentials("test-conn")(useConnectionsStore.getState()),
      ).toEqual(credentials);
    });

    test("selectConnectionConfig returns config or null", () => {
      const state = useConnectionsStore.getState();
      expect(selectConnectionConfig("missing")(state)).toBeNull();

      useConnectionsStore
        .getState()
        .setConnection("test-conn", credentials, connectionConfig);

      expect(
        selectConnectionConfig("test-conn")(useConnectionsStore.getState()),
      ).toEqual(connectionConfig);
    });
  });

  describe("partialize", () => {
    test("only persists credentials and connectionConfig", () => {
      useConnectionsStore
        .getState()
        .setConnection("test-conn", credentials, connectionConfig);

      const persistConfig = (
        useConnectionsStore as unknown as {
          persist: { getOptions: () => { partialize: (state: unknown) => unknown } };
        }
      ).persist.getOptions();

      const partialized = persistConfig.partialize(
        useConnectionsStore.getState(),
      ) as { connections: Record<string, ConnectionRecord> };

      const record = partialized.connections["test-conn"];
      expect(record).toBeDefined();
      expect(record.credentials).toEqual(credentials);
      expect(record.connectionConfig).toEqual(connectionConfig);
      // Should not include store methods
      expect(partialized).not.toHaveProperty("setConnection");
      expect(partialized).not.toHaveProperty("clearConnection");
      expect(partialized).not.toHaveProperty("clearAll");
    });
  });
});
