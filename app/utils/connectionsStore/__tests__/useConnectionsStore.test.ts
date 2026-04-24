import {
  resolveResourceId,
  select,
  selectConnection,
  selectHttpsUrl,
} from "../selectors";
import {
  useConnectionsStore,
  type ConnectionRecord,
} from "../useConnectionsStore";
import mock from "~/utils/__tests__/__mocks__";

describe("useConnectionsStore", () => {
  const credentials = mock.credentials();
  const connectionConfig = mock.connectionConfig({
    name: "test-conn",
    bucketName: "test-bucket",
  });

  beforeEach(() => {
    useConnectionsStore.setState({
      connectionConfigs: {},
      bucketCredentials: {},
    });
  });

  describe("setConnection", () => {
    test("stores credentials (by bucketName) and connectionConfig (by name)", () => {
      useConnectionsStore
        .getState()
        .setConnection(credentials, connectionConfig);

      const state = useConnectionsStore.getState();
      expect(state.connectionConfigs["test-conn"]).toEqual(connectionConfig);
      expect(state.bucketCredentials["test-bucket"]).toEqual(credentials);
    });

    test("overwrites existing connection credentials atomically (same bucket)", () => {
      useConnectionsStore
        .getState()
        .setConnection(credentials, connectionConfig);

      const newCredentials = mock.credentials({ AccessKeyId: "newKey" });
      useConnectionsStore
        .getState()
        .setConnection(newCredentials, connectionConfig);

      expect(
        useConnectionsStore.getState().bucketCredentials["test-bucket"]
          .AccessKeyId,
      ).toBe("newKey");
    });

    test("sibling connections sharing a bucket share credentials", () => {
      const configA = mock.connectionConfig({
        name: "conn-a",
        bucketName: "shared-bucket",
      });
      const configB = mock.connectionConfig({
        name: "conn-b",
        bucketName: "shared-bucket",
      });

      useConnectionsStore.getState().setConnection(credentials, configA);
      useConnectionsStore.getState().setConnection(credentials, configB);

      const state = useConnectionsStore.getState();
      expect(state.connectionConfigs["conn-a"]).toEqual(configA);
      expect(state.connectionConfigs["conn-b"]).toEqual(configB);
      // One credentials entry, shared by both.
      expect(Object.keys(state.bucketCredentials)).toEqual(["shared-bucket"]);
    });
  });

  describe("selectors", () => {
    test("selectConnection returns joined record or null", () => {
      expect(
        selectConnection("missing")(useConnectionsStore.getState()),
      ).toBeNull();

      useConnectionsStore
        .getState()
        .setConnection(credentials, connectionConfig);

      const record = selectConnection("test-conn")(
        useConnectionsStore.getState(),
      );
      expect(record).not.toBeNull();
      expect((record as ConnectionRecord).credentials).toEqual(credentials);
      expect((record as ConnectionRecord).connectionConfig).toEqual(
        connectionConfig,
      );
    });

    test("selectCredentials joins via bucketName", () => {
      expect(
        select.credentials("missing")(useConnectionsStore.getState()),
      ).toBeUndefined();

      useConnectionsStore
        .getState()
        .setConnection(credentials, connectionConfig);

      expect(
        select.credentials("test-conn")(useConnectionsStore.getState()),
      ).toEqual(credentials);
    });

    test("selectHttpsUrl returns null when connection is not in store", () => {
      expect(
        selectHttpsUrl("missing/data/file.ome.tif")(
          useConnectionsStore.getState(),
        ),
      ).toBeNull();
    });

    test("selectHttpsUrl rejoins configured prefix before the pathName (C-161)", () => {
      useConnectionsStore.getState().setConnection(
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
        "https://s3.eu-central-1.amazonaws.com/my-bucket/vericura/USL-2022-42307-42.ome.tif",
      );
    });

    test("selectHttpsUrl omits prefix join when prefix is empty", () => {
      useConnectionsStore.getState().setConnection(
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
        "https://s3.eu-central-1.amazonaws.com/my-bucket/file.ome.tif",
      );
    });

    test("resolveResourceId exposes httpsUrl matching selectHttpsUrl", () => {
      useConnectionsStore.getState().setConnection(
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
    });
  });

  describe("partialize", () => {
    test("persists configs + credentials; excludes methods", () => {
      useConnectionsStore
        .getState()
        .setConnection(credentials, connectionConfig);

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
      ) as Record<string, unknown>;

      expect(partialized).toHaveProperty("connectionConfigs");
      expect(partialized).toHaveProperty("bucketCredentials");
      expect(partialized).not.toHaveProperty("setConnection");
      expect(partialized).not.toHaveProperty("clearConnection");
      expect(partialized).not.toHaveProperty("clearAll");
    });
  });
});
