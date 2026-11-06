import { render, waitFor } from "@testing-library/react";
import { createRoutesStub } from "react-router";

import { useProviderCatalog } from "../useProviderCatalog";
import mock from "~/utils/__tests__/__mocks__";
import { toClientCatalog } from "~/utils/providerCatalog.schema";

type State = ReturnType<typeof useProviderCatalog>;

/**
 * Renders the hook as the `/:org` route's component and captures each state
 * update in `states` — renderHook cannot inject the router context the
 * hook's `useParams()` call needs.
 */
function renderHookAt(path: string): { states: State[] } {
  const states: State[] = [];
  const Harness = () => {
    states.push(useProviderCatalog());
    return null;
  };
  const Stub = createRoutesStub([
    { path: "/", Component: Harness },
    { path: "/:org", Component: Harness },
  ]);
  render(<Stub initialEntries={[path]} />);
  return { states };
}

describe("useProviderCatalog", () => {
  test("loads the catalog from the api route without an org segment", async () => {
    const catalog = toClientCatalog(mock.providerCatalog());
    const fetchMock = vi.fn().mockResolvedValue({ json: () => Promise.resolve({ catalog }) });
    vi.stubGlobal("fetch", fetchMock);

    const { states } = renderHookAt("/");
    await waitFor(() => expect(states.at(-1)?.loading).toBe(false));

    expect(states.at(-1)?.catalog).toEqual(catalog);
    expect(states.at(-1)?.error).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/provider-catalog",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  test("appends the page's org under a /:org route", async () => {
    const catalog = toClientCatalog(mock.providerCatalog());
    const fetchMock = vi.fn().mockResolvedValue({ json: () => Promise.resolve({ catalog }) });
    vi.stubGlobal("fetch", fetchMock);

    const { states } = renderHookAt("/zeta");
    await waitFor(() => expect(states.at(-1)?.loading).toBe(false));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/zeta/provider-catalog",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(states.at(-1)?.catalog).toEqual(catalog);
  });

  test("encodes the org alias", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ json: () => Promise.resolve({ catalog: undefined }) });
    vi.stubGlobal("fetch", fetchMock);

    const { states } = renderHookAt("/acme%20labs");
    await waitFor(() => expect(states.at(-1)?.loading).toBe(false));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/acme%20labs/provider-catalog",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  test("surfaces the advisory error and never throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ json: () => Promise.resolve({ error: "catalog down" }) }),
    );

    const { states } = renderHookAt("/zeta");
    await waitFor(() => expect(states.at(-1)?.loading).toBe(false));

    expect(states.at(-1)?.catalog).toBeUndefined();
    expect(states.at(-1)?.error).toBe("catalog down");
  });

  test("maps a network failure to an error state", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    const { states } = renderHookAt("/");
    await waitFor(() => expect(states.at(-1)?.loading).toBe(false));

    expect(states.at(-1)?.error).toBe("offline");
  });
});
