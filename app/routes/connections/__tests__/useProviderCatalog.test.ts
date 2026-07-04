import { renderHook, waitFor } from "@testing-library/react";

import { useProviderCatalog } from "../useProviderCatalog";
import mock from "~/utils/__tests__/__mocks__";
import { toClientCatalog } from "~/utils/providerCatalog.schema";

describe("useProviderCatalog", () => {
  test("loads the catalog from the api route", async () => {
    const catalog = toClientCatalog(mock.providerCatalog());
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: () => Promise.resolve({ catalog }) }));

    const { result } = renderHook(() => useProviderCatalog());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.catalog).toEqual(catalog);
    expect(result.current.error).toBeUndefined();
  });

  test("surfaces the advisory error and never throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ json: () => Promise.resolve({ error: "catalog down" }) }),
    );

    const { result } = renderHook(() => useProviderCatalog());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.catalog).toBeUndefined();
    expect(result.current.error).toBe("catalog down");
  });

  test("maps a network failure to an error state", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    const { result } = renderHook(() => useProviderCatalog());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe("offline");
  });
});
