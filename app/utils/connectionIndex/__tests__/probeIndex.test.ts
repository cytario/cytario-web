import { probeIndex } from "../probeIndex";
import mock from "~/utils/__tests__/__mocks__";
import { useConnectionsStore } from "~/utils/connectionsStore";

describe("probeIndex", () => {
  const credentials = mock.credentials();
  const connectionConfig = mock.connectionConfig({ name: "test-connection" });

  beforeEach(() => {
    useConnectionsStore.setState({ connections: {} });
    vi.restoreAllMocks();
  });

  test("sets loading state then ready when index exists", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          exists: true,
          objectCount: 100,
          builtAt: "2025-06-15T12:00:00Z",
        }),
        { status: 200 },
      ),
    );

    // Set initial connection so setConnectionIndex has a valid target
    useConnectionsStore
      .getState()
      .setConnection("test-connection", credentials, connectionConfig);

    await probeIndex("test-connection");

    const state = useConnectionsStore.getState();
    const index = state.connections["test-connection"]?.connectionIndex;

    expect(index?.status).toBe("ready");
    expect(index?.objectCount).toBe(100);
    expect(index?.builtAt).toBe("2025-06-15T12:00:00Z");
  });

  test("sets missing state when index does not exist", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ exists: false }), { status: 200 }),
    );

    // Connection must exist for setConnectionIndex to work
    useConnectionsStore
      .getState()
      .setConnection("test-connection", credentials, connectionConfig);

    await probeIndex("test-connection");

    const state = useConnectionsStore.getState();
    const index = state.connections["test-connection"]?.connectionIndex;

    expect(index?.status).toBe("missing");
    expect(index?.objectCount).toBe(0);
  });

  test("sets error state on non-ok response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Server error", { status: 500 }),
    );

    useConnectionsStore
      .getState()
      .setConnection("test-connection", credentials, connectionConfig);

    await probeIndex("test-connection");

    const state = useConnectionsStore.getState();
    const index = state.connections["test-connection"]?.connectionIndex;

    expect(index?.status).toBe("error");
  });

  test("sets error state on network failure", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new Error("Network failure"),
    );

    useConnectionsStore
      .getState()
      .setConnection("test-connection", credentials, connectionConfig);

    await probeIndex("test-connection");

    const state = useConnectionsStore.getState();
    const index = state.connections["test-connection"]?.connectionIndex;

    expect(index?.status).toBe("error");
  });

  test("skips probe when status is already ready", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    useConnectionsStore
      .getState()
      .setConnection("test-connection", credentials, connectionConfig);

    useConnectionsStore.getState().setConnectionIndex("test-connection", {
      status: "ready",
      objectCount: 50,
      builtAt: "2025-01-01T00:00:00Z",
    });

    await probeIndex("test-connection");

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("skips probe when status is already loading", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    useConnectionsStore
      .getState()
      .setConnection("test-connection", credentials, connectionConfig);

    useConnectionsStore.getState().setConnectionIndex("test-connection", {
      status: "loading",
      objectCount: 0,
      builtAt: null,
    });

    await probeIndex("test-connection");

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("re-probes when status is error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ exists: true, objectCount: 10, builtAt: null }),
        { status: 200 },
      ),
    );

    useConnectionsStore
      .getState()
      .setConnection("test-connection", credentials, connectionConfig);

    useConnectionsStore.getState().setConnectionIndex("test-connection", {
      status: "error",
      objectCount: 0,
      builtAt: null,
    });

    await probeIndex("test-connection");

    const state = useConnectionsStore.getState();
    const index = state.connections["test-connection"]?.connectionIndex;

    expect(index?.status).toBe("ready");
    expect(index?.objectCount).toBe(10);
  });

  test("re-probes when status is missing", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ exists: true, objectCount: 5, builtAt: null }),
        { status: 200 },
      ),
    );

    useConnectionsStore
      .getState()
      .setConnection("test-connection", credentials, connectionConfig);

    useConnectionsStore.getState().setConnectionIndex("test-connection", {
      status: "missing",
      objectCount: 0,
      builtAt: null,
    });

    await probeIndex("test-connection");

    const state = useConnectionsStore.getState();
    const index = state.connections["test-connection"]?.connectionIndex;

    expect(index?.status).toBe("ready");
  });

  test("does not create ghost entry when connection does not exist", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          exists: true,
          objectCount: 100,
          builtAt: "2025-06-15T12:00:00Z",
        }),
        { status: 200 },
      ),
    );

    // Do NOT set a connection -- probeIndex should not create a ghost entry
    await probeIndex("nonexistent-connection");

    const state = useConnectionsStore.getState();
    expect(state.connections["nonexistent-connection"]).toBeUndefined();
  });
});
