import { resolveResourceId, select, selectHttpsUrl } from "../selectors";
import { useConnectionsStore } from "../useConnectionsStore";
import mock from "~/utils/__tests__/__mocks__";

describe("useConnectionsStore", () => {
  const credentials = mock.credentials();
  const connectionConfig = mock.connectionConfig({
    name: "test-conn",
    bucketName: "test-bucket",
  });

  beforeEach(() => {
    useConnectionsStore.setState({ connections: {} });
  });

  describe("setConnection", () => {
    test("stores connection keyed by config.name", () => {
      useConnectionsStore
        .getState()
        .setConnection(credentials, connectionConfig);

      const entry = useConnectionsStore.getState().connections["test-conn"];
      expect(entry).toBeDefined();
      expect(entry.connectionConfig).toEqual(connectionConfig);
      expect(entry.credentials).toEqual(credentials);
    });

    test("overwrites existing entry on subsequent calls", () => {
      useConnectionsStore
        .getState()
        .setConnection(credentials, connectionConfig);

      const newCredentials = mock.credentials({ AccessKeyId: "newKey" });
      useConnectionsStore
        .getState()
        .setConnection(newCredentials, connectionConfig);

      expect(
        useConnectionsStore.getState().connections["test-conn"]?.credentials
          .AccessKeyId,
      ).toBe("newKey");
    });

    test("sibling connections sharing a bucket each get their own entry", () => {
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

      const { connections } = useConnectionsStore.getState();
      expect(connections["conn-a"]?.connectionConfig).toEqual(configA);
      expect(connections["conn-b"]?.connectionConfig).toEqual(configB);
      expect(Object.keys(connections)).toEqual(["conn-a", "conn-b"]);
    });
  });

  describe("reconcileConnections", () => {
    test("joins configs[] with bucket-keyed credentials", () => {
      const configs = [
        mock.connectionConfig({ name: "conn-a", bucketName: "bucket-a" }),
        mock.connectionConfig({ name: "conn-b", bucketName: "bucket-b" }),
      ];
      const bucketCredentials = {
        "bucket-a": mock.credentials({ AccessKeyId: "key-a" }),
        "bucket-b": mock.credentials({ AccessKeyId: "key-b" }),
      };

      useConnectionsStore
        .getState()
        .reconcileConnections(configs, bucketCredentials);

      const { connections } = useConnectionsStore.getState();
      expect(connections["conn-a"]?.credentials.AccessKeyId).toBe("key-a");
      expect(connections["conn-b"]?.credentials.AccessKeyId).toBe("key-b");
    });

    test("prunes connections deleted server-side", () => {
      useConnectionsStore
        .getState()
        .setConnection(credentials, connectionConfig);

      useConnectionsStore.getState().reconcileConnections([], {});

      expect(useConnectionsStore.getState().connections).toEqual({});
    });

    test("skips configs without matching bucket credentials", () => {
      const configs = [
        mock.connectionConfig({ name: "conn-a", bucketName: "bucket-a" }),
        mock.connectionConfig({ name: "conn-b", bucketName: "bucket-b" }),
      ];
      const bucketCredentials = {
        "bucket-a": mock.credentials(),
        // bucket-b has no credentials
      };

      useConnectionsStore
        .getState()
        .reconcileConnections(configs, bucketCredentials);

      const { connections } = useConnectionsStore.getState();
      expect(connections["conn-a"]).toBeDefined();
      expect(connections["conn-b"]).toBeUndefined();
    });
  });

  describe("selectors", () => {
    test("select.credentials returns the connection's credentials", () => {
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
    test("persists connections; excludes methods", () => {
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

      expect(partialized).toHaveProperty("connections");
      expect(partialized).not.toHaveProperty("setConnection");
      expect(partialized).not.toHaveProperty("reconcileConnections");
    });
  });
});
