import { resolveResourceId, select, selectHttpsUrl } from "../selectors";
import { useConnectionsStore } from "../useConnectionsStore";
import mock from "~/utils/__tests__/__mocks__";

describe("useConnectionsStore", () => {
  const credentials = mock.credentials();
  const connectionConfig = mock.connectionConfig({
    name: "test-conn",
    bucketName: "test-bucket",
  });

  /** Helper: seed the store with a single connection. */
  const seed = (config = connectionConfig, creds = credentials) => {
    useConnectionsStore
      .getState()
      .setConnections([config], { [config.name]: creds });
  };

  beforeEach(() => {
    useConnectionsStore.setState({ connections: {} });
  });

  describe("setConnections", () => {
    test("joins configs[] with name-keyed credentials", () => {
      const configs = [
        mock.connectionConfig({ name: "conn-a" }),
        mock.connectionConfig({ name: "conn-b" }),
      ];
      const credsByName = {
        "conn-a": mock.credentials({ AccessKeyId: "key-a" }),
        "conn-b": mock.credentials({ AccessKeyId: "key-b" }),
      };

      useConnectionsStore.getState().setConnections(configs, credsByName);

      const { connections } = useConnectionsStore.getState();
      expect(connections["conn-a"]?.credentials.AccessKeyId).toBe("key-a");
      expect(connections["conn-b"]?.credentials.AccessKeyId).toBe("key-b");
    });

    test("prunes connections that are no longer in the input", () => {
      seed();
      useConnectionsStore.getState().setConnections([], {});
      expect(useConnectionsStore.getState().connections).toEqual({});
    });

    test("skips configs without matching credentials", () => {
      const configs = [
        mock.connectionConfig({ name: "conn-a" }),
        mock.connectionConfig({ name: "conn-b" }),
      ];
      const partial = {
        "conn-a": mock.credentials(),
        // conn-b has no credentials
      };

      useConnectionsStore.getState().setConnections(configs, partial);

      const { connections } = useConnectionsStore.getState();
      expect(connections["conn-a"]).toBeDefined();
      expect(connections["conn-b"]).toBeUndefined();
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

      useConnectionsStore.getState().setConnections([configA, configB], {
        "conn-a": credentials,
        "conn-b": credentials,
      });

      const { connections } = useConnectionsStore.getState();
      expect(connections["conn-a"]?.connectionConfig).toEqual(configA);
      expect(connections["conn-b"]?.connectionConfig).toEqual(configB);
      expect(Object.keys(connections)).toEqual(["conn-a", "conn-b"]);
    });
  });

  describe("selectors", () => {
    test("select.credentials returns the connection's credentials", () => {
      expect(
        select.credentials("missing")(useConnectionsStore.getState()),
      ).toBeUndefined();

      seed();

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
      seed(
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
      seed(
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
      seed(
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
      seed();

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
      expect(partialized).not.toHaveProperty("setConnections");
    });
  });
});
