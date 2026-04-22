import {
  resolveResourceId,
  selectConnection,
  selectConnectionConfig,
  selectConnectionIndex,
  selectCredentials,
  selectHttpsUrl,
} from "../selectors";
import {
  useConnectionsStore,
  type ConnectionRecord,
} from "../useConnectionsStore";
import mock from "~/utils/__tests__/__mocks__";

describe("useConnectionsStore", () => {
  const credentials = mock.credentials();
  const connectionConfig = mock.connectionConfig({ name: "test-conn" });

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

  describe("setConnectionIndex", () => {
    test("sets connection index on an existing connection", () => {
      useConnectionsStore
        .getState()
        .setConnection("my-conn", credentials, connectionConfig);

      useConnectionsStore.getState().setConnectionIndex("my-conn", {
        status: "ready",
        objectCount: 500,
        builtAt: "2025-06-15T12:00:00Z",
      });

      const state = useConnectionsStore.getState();
      const index = state.connections["my-conn"]?.connectionIndex;

      expect(index).toEqual({
        status: "ready",
        objectCount: 500,
        builtAt: "2025-06-15T12:00:00Z",
      });
    });

    test("preserves existing credentials when setting index", () => {
      useConnectionsStore
        .getState()
        .setConnection("my-conn", credentials, connectionConfig);

      useConnectionsStore.getState().setConnectionIndex("my-conn", {
        status: "loading",
        objectCount: 0,
        builtAt: null,
      });

      const state = useConnectionsStore.getState();
      expect(state.connections["my-conn"]?.credentials).toEqual(credentials);
      expect(state.connections["my-conn"]?.connectionIndex?.status).toBe(
        "loading",
      );
    });

    test("updates existing index state", () => {
      useConnectionsStore
        .getState()
        .setConnection("my-conn", credentials, connectionConfig);

      useConnectionsStore.getState().setConnectionIndex("my-conn", {
        status: "loading",
        objectCount: 0,
        builtAt: null,
      });

      useConnectionsStore.getState().setConnectionIndex("my-conn", {
        status: "ready",
        objectCount: 1000,
        builtAt: "2025-06-15T12:00:00Z",
      });

      const state = useConnectionsStore.getState();
      const index = state.connections["my-conn"]?.connectionIndex;

      expect(index?.status).toBe("ready");
      expect(index?.objectCount).toBe(1000);
    });

    test("does not create ghost entry for non-existent connection", () => {
      useConnectionsStore.getState().setConnectionIndex("new-conn", {
        status: "missing",
        objectCount: 0,
        builtAt: null,
      });

      const state = useConnectionsStore.getState();
      expect(state.connections["new-conn"]).toBeUndefined();
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
          mock.connectionConfig({ name: "conn-b" }),
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
          mock.connectionConfig({ name: "conn-b" }),
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

    test("selectConnectionIndex returns null when connection does not exist", () => {
      const state = useConnectionsStore.getState();
      const result = selectConnectionIndex("nonexistent")(state);

      expect(result).toBeNull();
    });

    test("selectConnectionIndex returns null when connection exists but has no index", () => {
      useConnectionsStore
        .getState()
        .setConnection("my-conn", credentials, connectionConfig);

      const state = useConnectionsStore.getState();
      const result = selectConnectionIndex("my-conn")(state);

      expect(result).toBeNull();
    });

    test("selectConnectionIndex returns connection index when present", () => {
      useConnectionsStore
        .getState()
        .setConnection("my-conn", credentials, connectionConfig);

      useConnectionsStore.getState().setConnectionIndex("my-conn", {
        status: "ready",
        objectCount: 42,
        builtAt: "2025-01-01T00:00:00Z",
      });

      const state = useConnectionsStore.getState();
      const result = selectConnectionIndex("my-conn")(state);

      expect(result).toEqual({
        status: "ready",
        objectCount: 42,
        builtAt: "2025-01-01T00:00:00Z",
      });
    });

    test("selectHttpsUrl returns null when connection is not in store", () => {
      const state = useConnectionsStore.getState();
      expect(selectHttpsUrl("missing/data/file.ome.tif")(state)).toBeNull();
    });

    test("selectHttpsUrl rejoins configured prefix before the pathName (C-161)", () => {
      useConnectionsStore.getState().setConnection(
        "prefixed-conn",
        credentials,
        mock.connectionConfig({
          name: "prefixed-conn",
          bucketName: "my-bucket",
          region: "eu-central-1",
          endpoint: "",
          prefix: "vericura",
        }),
      );

      const url = selectHttpsUrl("prefixed-conn/USL-2022-42307-42.ome.tif")(
        useConnectionsStore.getState(),
      );

      expect(url).toBe(
        "https://my-bucket.s3.eu-central-1.amazonaws.com/vericura/USL-2022-42307-42.ome.tif",
      );
    });

    test("selectHttpsUrl omits prefix join when prefix is empty", () => {
      useConnectionsStore.getState().setConnection(
        "no-prefix",
        credentials,
        mock.connectionConfig({
          name: "no-prefix",
          bucketName: "my-bucket",
          region: "eu-central-1",
          endpoint: "",
          prefix: "",
        }),
      );

      const url = selectHttpsUrl("no-prefix/file.ome.tif")(
        useConnectionsStore.getState(),
      );

      expect(url).toBe(
        "https://my-bucket.s3.eu-central-1.amazonaws.com/file.ome.tif",
      );
    });

    test("resolveResourceId exposes httpsUrl matching selectHttpsUrl", () => {
      useConnectionsStore.getState().setConnection(
        "prefixed-conn",
        credentials,
        mock.connectionConfig({
          name: "prefixed-conn",
          bucketName: "my-bucket",
          region: "eu-central-1",
          endpoint: "",
          prefix: "data",
        }),
      );

      const resourceId = "prefixed-conn/image.ome.tif";
      const resolved = resolveResourceId(resourceId);
      const selectorUrl = selectHttpsUrl(resourceId)(
        useConnectionsStore.getState(),
      );

      expect(resolved.httpsUrl).toBe(selectorUrl);
      expect(resolved.s3Key).toBe("data/image.ome.tif");
    });
  });

  describe("partialize", () => {
    test("only persists credentials and connectionConfig, excludes connectionIndex", () => {
      useConnectionsStore
        .getState()
        .setConnection("test-conn", credentials, connectionConfig);

      useConnectionsStore.getState().setConnectionIndex("test-conn", {
        status: "ready",
        objectCount: 100,
        builtAt: "2025-06-15T12:00:00Z",
      });

      const persistConfig = (
        useConnectionsStore as unknown as {
          persist: {
            getOptions: () => {
              partialize: (state: unknown) => unknown;
            };
          };
        }
      ).persist.getOptions();

      const partialized = persistConfig.partialize(
        useConnectionsStore.getState(),
      ) as { connections: Record<string, ConnectionRecord> };

      const record = partialized.connections["test-conn"];
      expect(record).toBeDefined();
      expect(record.credentials).toEqual(credentials);
      expect(record.connectionConfig).toEqual(connectionConfig);
      // connectionIndex should not be persisted
      expect(record).not.toHaveProperty("connectionIndex");
      // Should not include store methods
      expect(partialized).not.toHaveProperty("setConnection");
      expect(partialized).not.toHaveProperty("clearConnection");
      expect(partialized).not.toHaveProperty("clearAll");
    });
  });
});
