import { render, waitFor } from "@testing-library/react";
import { createRoutesStub } from "react-router";

import { useBucketCatalog } from "../useBucketCatalog";

type State = ReturnType<typeof useBucketCatalog>;

/**
 * Renders the hook as the `/:org` route's component and captures each state
 * update in `states` — renderHook cannot inject the router context the
 * hook's `useParams()` call needs.
 */
function renderHookAt(path: string): { states: State[] } {
  const states: State[] = [];
  const Harness = () => {
    states.push(useBucketCatalog());
    return null;
  };
  const Stub = createRoutesStub([
    { path: "/", Component: Harness },
    { path: "/:org", Component: Harness },
  ]);
  render(<Stub initialEntries={[path]} />);
  return { states };
}

const catalog = { buckets: [] };

describe("useBucketCatalog", () => {
  test("fetches without ?org outside a /:org route", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ json: () => Promise.resolve({ source: "portal", catalog }) });
    vi.stubGlobal("fetch", fetchMock);

    const { states } = renderHookAt("/");
    await waitFor(() => expect(states.at(-1)?.loading).toBe(false));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/bucket-catalog",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(states.at(-1)?.source).toBe("portal");
    expect(states.at(-1)?.catalog).toEqual(catalog);
  });

  test("appends the page's org under a /:org route", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ json: () => Promise.resolve({ source: "portal", catalog }) });
    vi.stubGlobal("fetch", fetchMock);

    const { states } = renderHookAt("/zeta");
    await waitFor(() => expect(states.at(-1)?.loading).toBe(false));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/zeta/bucket-catalog",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(states.at(-1)?.catalog).toEqual(catalog);
  });

  test("surfaces the advisory error and never throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ source: "portal", error: "down" }),
      }),
    );

    const { states } = renderHookAt("/zeta");
    await waitFor(() => expect(states.at(-1)?.loading).toBe(false));

    expect(states.at(-1)?.catalog).toBeUndefined();
    expect(states.at(-1)?.error).toBe("down");
  });
});
