import { resolveResourceId, select, selectHttpsUrl } from "../selectors";
import { useConnectionsStore } from "../useConnectionsStore";
import mock from "~/utils/__tests__/__mocks__";

describe("useConnectionsStore", () => {
  const credentials = mock.credentials();
  const connectionConfig = mock.connectionConfig({
    name: "test-conn",
    bucketName: "test-bucket",
  });

  /**
   * Helper: seed the store with a single connection. The non-secret provider
   * region/endpoint now live in the resolved-provider map, not on the config row.
   */
  const seed = (
    config = connectionConfig,
    creds = credentials,
    provider?: { region: string; endpoint: string | null; allowsSharing?: boolean },
  ) => {
    useConnectionsStore
      .getState()
      .setConnections(
        [config],
        { [config.name]: creds },
        {},
        provider ? { [config.name]: { allowsSharing: false, ...provider } } : {},
      );
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
      expect(connections["conn-a"]?.credentials?.AccessKeyId).toBe("key-a");
      expect(connections["conn-b"]?.credentials?.AccessKeyId).toBe("key-b");
    });

    test("prunes connections that are no longer in the input", () => {
      seed();
      useConnectionsStore.getState().setConnections([], {});
      expect(useConnectionsStore.getState().connections).toEqual({});
    });

    test("keeps configs without matching credentials, flagged as errored", () => {
      const configs = [
        mock.connectionConfig({ name: "conn-a" }),
        mock.connectionConfig({ name: "conn-b" }),
      ];
      const partial = {
        "conn-a": mock.credentials(),
        // conn-b has no credentials
      };

      useConnectionsStore.getState().setConnections(configs, partial, {
        "conn-b": "STS assume role failed",
      });

      const { connections } = useConnectionsStore.getState();
      // Credentialed connection is usable immediately — no stuck "loading".
      expect(connections["conn-a"]?.status).toBe("connected");
      // Broken connection stays visible/manageable rather than vanishing.
      expect(connections["conn-b"]?.credentials).toBeNull();
      expect(connections["conn-b"]?.status).toBe("error");
      expect(connections["conn-b"]?.statusMessage).toBe("STS assume role failed");
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
      expect(select.credentials("missing")(useConnectionsStore.getState())).toBeUndefined();

      seed();

      expect(select.credentials("test-conn")(useConnectionsStore.getState())).toEqual(credentials);
    });

    test("selectHttpsUrl returns null when connection is not in store", () => {
      expect(
        selectHttpsUrl("missing/data/file.ome.tif")(useConnectionsStore.getState()),
      ).toBeNull();
    });

    test("selectHttpsUrl rejoins configured prefix before the pathName (C-161)", () => {
      seed(
        mock.connectionConfig({
          name: "prefixed-conn",
          bucketName: "my-bucket",
          prefix: "tenant-a",
        }),
        credentials,
        { region: "eu-central-1", endpoint: null },
      );

      const url = selectHttpsUrl("prefixed-conn/sample-001.ome.tif")(
        useConnectionsStore.getState(),
      );

      expect(url).toBe(
        "https://s3.eu-central-1.amazonaws.com/my-bucket/tenant-a/sample-001.ome.tif",
      );
    });

    test("selectHttpsUrl omits prefix join when prefix is empty", () => {
      seed(
        mock.connectionConfig({
          name: "no-prefix",
          bucketName: "my-bucket",
          prefix: "",
        }),
        credentials,
        { region: "eu-central-1", endpoint: null },
      );

      const url = selectHttpsUrl("no-prefix/file.ome.tif")(useConnectionsStore.getState());

      expect(url).toBe("https://s3.eu-central-1.amazonaws.com/my-bucket/file.ome.tif");
    });

    test("resolveResourceId exposes httpsUrl matching selectHttpsUrl", () => {
      seed(
        mock.connectionConfig({
          name: "prefixed-conn",
          bucketName: "my-bucket",
          prefix: "data",
        }),
        credentials,
        { region: "eu-central-1", endpoint: null },
      );

      const resourceId = "prefixed-conn/image.ome.tif";
      const resolved = resolveResourceId(resourceId);
      const selectorUrl = selectHttpsUrl(resourceId)(useConnectionsStore.getState());

      expect(resolved.httpsUrl).toBe(selectorUrl);
    });
  });

  describe("persistence", () => {
    test("store is in-memory only — no persist middleware attached", () => {
      // The store must not expose a `.persist` API. STS credentials are
      // sensitive enough that they must never be written to
      // sessionStorage / localStorage.
      expect((useConnectionsStore as unknown as { persist?: unknown }).persist).toBeUndefined();
    });

    test("no `connections-storage` key written to sessionStorage", () => {
      seed();

      // Persist middleware would have written this on first state change.
      expect(sessionStorage.getItem("connections-storage")).toBeNull();
    });
  });
});
