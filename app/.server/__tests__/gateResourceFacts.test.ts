import { beforeEach, describe, expect, test, vi } from "vitest";

import { resolveGateResource } from "../gateResourceFacts.server";
import { getProviderCatalog } from "~/.server/providers/providerCatalog.server";
import { getConnection } from "~/routes/connections/connections.server";
import mock from "~/utils/__tests__/__mocks__";

const runGatesMock = vi.hoisted(() => vi.fn());
const hasGatesMock = vi.hoisted(() => vi.fn());

vi.mock("~/.server/pluginGates", () => ({
  runGates: runGatesMock,
  hasGates: hasGatesMock,
}));

vi.mock("~/.server/providers/providerCatalog.server", async () => {
  const actual = await vi.importActual<typeof import("~/.server/providers/providerCatalog.server")>(
    "~/.server/providers/providerCatalog.server",
  );
  return { ...actual, getProviderCatalog: vi.fn() };
});

vi.mock("~/routes/connections/connections.server", () => ({
  getConnection: vi.fn(),
}));

const { lockedConnectionIds } = await import("../gateResourceFacts.server");

const user = mock.user();
const authTokens = { accessToken: "access", refreshToken: "refresh", idToken: "id" };

const base = {
  user,
  organization: "org1",
  sessionId: "session-1",
  authTokens,
};

const request = (url: string, init?: RequestInit) => new Request(url, init);

beforeEach(() => {
  vi.clearAllMocks();
  hasGatesMock.mockReturnValue(true);
  runGatesMock.mockResolvedValue({ kind: "continue" });
  vi.mocked(getConnection).mockResolvedValue(
    mock.connectionConfig({ id: "conn-1", providerConnectionId: "pc-mock" }),
  );
  vi.mocked(getProviderCatalog).mockResolvedValue(mock.providerCatalog());
});

describe("resolveGateResource", () => {
  test("no gate registered in this build: no facts are resolved at all", async () => {
    hasGatesMock.mockReturnValue(false);

    const facts = await resolveGateResource({
      ...base,
      request: request("http://localhost/org1/conn-1/data/x.ome.tif"),
      url: new URL("http://localhost/org1/conn-1/data/x.ome.tif"),
    });

    expect(facts).toBeUndefined();
    expect(getConnection).not.toHaveBeenCalled();
    expect(getProviderCatalog).not.toHaveBeenCalled();
  });

  test("a /:org/:id/* path resolves the connection id and its provider's publicness", async () => {
    vi.mocked(getProviderCatalog).mockResolvedValue(
      mock.providerCatalog({
        providerConnections: [mock.providerConnection({ id: "pc-mock", isPublic: true })],
      }),
    );

    const facts = await resolveGateResource({
      ...base,
      request: request("http://localhost/org1/conn-1/data/x.ome.tif"),
      url: new URL("http://localhost/org1/conn-1/data/x.ome.tif"),
    });

    expect(facts).toEqual({ connectionId: "conn-1", isPublic: true });
    // The row read is org-scoped and canSee-filtered.
    expect(getConnection).toHaveBeenCalledWith(user, "org1", "conn-1");
  });

  test("a cyberduck-profile API path resolves the same facts as the connection's browse path", async () => {
    vi.mocked(getProviderCatalog).mockResolvedValue(
      mock.providerCatalog({
        providerConnections: [mock.providerConnection({ id: "pc-mock", isPublic: false })],
      }),
    );

    const facts = await resolveGateResource({
      ...base,
      request: request("http://localhost/api/v1/org1/cyberduck-profile/conn-1"),
      url: new URL("http://localhost/api/v1/org1/cyberduck-profile/conn-1"),
    });

    // $id IS the connection id: the profile generator reads the row by it.
    expect(facts).toEqual({ connectionId: "conn-1", isPublic: false });
    expect(getConnection).toHaveBeenCalledWith(user, "org1", "conn-1");
  });

  test("a cyberduck-profile request for an unknown connection still contributes its id", async () => {
    vi.mocked(getConnection).mockResolvedValue(null);

    const facts = await resolveGateResource({
      ...base,
      request: request("http://localhost/api/v1/org1/cyberduck-profile/conn-x"),
      url: new URL("http://localhost/api/v1/org1/cyberduck-profile/conn-x"),
    });

    expect(facts).toEqual({ connectionId: "conn-x" });
  });

  test("other org API paths resolve no connection facts", async () => {
    for (const path of [
      "/api/v1/org1/provider-catalog",
      "/api/v1/org1/bucket-catalog",
      "/api/v1/org1/job-grant/initiate",
    ]) {
      const facts = await resolveGateResource({
        ...base,
        request: request(`http://localhost${path}`),
        url: new URL(`http://localhost${path}`),
      });
      expect(facts, path).toBeUndefined();
    }
    expect(getConnection).not.toHaveBeenCalled();
  });

  test("an unknown connection still contributes the id it named", async () => {
    vi.mocked(getConnection).mockResolvedValue(null);

    const facts = await resolveGateResource({
      ...base,
      request: request("http://localhost/org1/conn-x/"),
      url: new URL("http://localhost/org1/conn-x/"),
    });

    expect(facts).toEqual({ connectionId: "conn-x" });
  });

  test("an unavailable catalog leaves publicness unknown rather than failing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(getProviderCatalog).mockRejectedValue(new Error("portal down"));

    const facts = await resolveGateResource({
      ...base,
      request: request("http://localhost/org1/conn-1"),
      url: new URL("http://localhost/org1/conn-1"),
    });

    expect(facts).toEqual({ connectionId: "conn-1", isPublic: undefined });
    warn.mockRestore();
  });

  test("the org root and org-scoped routes that are not connections resolve nothing", async () => {
    for (const path of ["/org1/", "/org1", "/org1/recent", "/org1/config", "/org1/local/x.tif"]) {
      const facts = await resolveGateResource({
        ...base,
        request: request(`http://localhost${path}`),
        url: new URL(`http://localhost${path}`),
      });
      expect(facts, path).toBeUndefined();
    }
    expect(getConnection).not.toHaveBeenCalled();
  });

  test("a create-connection POST to the org root resolves the submitted provider's publicness", async () => {
    vi.mocked(getProviderCatalog).mockResolvedValue(
      mock.providerCatalog({
        providerConnections: [mock.providerConnection({ id: "pc-public", isPublic: true })],
      }),
    );
    const body = new URLSearchParams({
      providerConnectionId: "pc-public",
      bucketName: "bucket",
      name: "A connection",
    });
    const formRequest = request("http://localhost/org1", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });

    const facts = await resolveGateResource({
      ...base,
      request: formRequest,
      url: new URL("http://localhost/org1"),
    });

    expect(facts).toEqual({ isPublic: true });
    // Cloned, never consumed: the action must still read the body.
    expect(formRequest.bodyUsed).toBe(false);
  });

  test("a non-form POST to the org root resolves nothing", async () => {
    const facts = await resolveGateResource({
      ...base,
      request: request("http://localhost/org1", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
      url: new URL("http://localhost/org1"),
    });

    expect(facts).toBeUndefined();
    expect(getProviderCatalog).not.toHaveBeenCalled();
  });

  test("a POST to a connection path resolves that connection, not a provider reference", async () => {
    const facts = await resolveGateResource({
      ...base,
      request: request("http://localhost/org1/conn-1", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ providerConnectionId: "pc-mock" }),
      }),
      url: new URL("http://localhost/org1/conn-1"),
    });

    expect(facts).toEqual({ connectionId: "conn-1", isPublic: false });
  });
});

describe("lockedConnectionIds", () => {
  const listed = [
    { connectionId: "conn-private", isPublic: false },
    { connectionId: "conn-public", isPublic: true },
  ];

  test("probes each listed connection with its own facts and collects the locked ones", async () => {
    runGatesMock.mockImplementation(async (req: { resource?: { connectionId?: string } }) =>
      req.resource?.connectionId === "conn-private"
        ? { kind: "lock", connectionIds: ["conn-private"] }
        : { kind: "continue" },
    );

    await expect(lockedConnectionIds(user, "org1", listed)).resolves.toEqual(["conn-private"]);

    // One question per connection, naming that connection — never the org root.
    expect(runGatesMock).toHaveBeenCalledTimes(2);
    expect(runGatesMock).toHaveBeenCalledWith({
      url: "/org1/conn-private",
      method: "GET",
      identity: expect.objectContaining({ organization: "org1" }),
      resource: { connectionId: "conn-private", isPublic: false },
    });
    expect(runGatesMock).toHaveBeenCalledWith({
      url: "/org1/conn-public",
      method: "GET",
      identity: expect.objectContaining({ organization: "org1" }),
      resource: { connectionId: "conn-public", isPublic: true },
    });
  });

  test("a deny verdict also marks the row locked", async () => {
    runGatesMock.mockResolvedValue({ kind: "deny", status: 402 });

    await expect(lockedConnectionIds(user, "org1", listed)).resolves.toEqual([
      "conn-private",
      "conn-public",
    ]);
  });

  test("an unknown publicness is left absent rather than guessed", async () => {
    await lockedConnectionIds(user, "org1", [{ connectionId: "conn-1" }]);

    expect(runGatesMock).toHaveBeenCalledWith({
      url: "/org1/conn-1",
      method: "GET",
      identity: expect.objectContaining({ organization: "org1" }),
      resource: { connectionId: "conn-1" },
    });
  });

  test("continue locks nothing", async () => {
    await expect(lockedConnectionIds(user, "org1", listed)).resolves.toEqual([]);
  });

  test("no connections to probe asks the gate nothing", async () => {
    await expect(lockedConnectionIds(user, "org1", [])).resolves.toEqual([]);
    expect(runGatesMock).not.toHaveBeenCalled();
  });

  test("no gate in this build locks nothing", async () => {
    hasGatesMock.mockReturnValue(false);

    await expect(lockedConnectionIds(user, "org1", listed)).resolves.toEqual([]);
    expect(runGatesMock).not.toHaveBeenCalled();
  });
});
