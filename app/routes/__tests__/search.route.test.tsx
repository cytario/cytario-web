import { describe, expect, test } from "vitest";

import { loader, handle } from "~/routes/search.route";

describe("SearchRoute", () => {
  test("loader extracts query from the URL", () => {
    const request = new Request("http://localhost/search?query=patient-x");
    const result = loader({
      request,
      params: {},
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    expect(result).toEqual({ searchQuery: "patient-x" });
  });

  test("loader defaults missing query to empty string", () => {
    const request = new Request("http://localhost/search");
    const result = loader({
      request,
      params: {},
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    expect(result).toEqual({ searchQuery: "" });
  });

  test("handle returns the search breadcrumb", () => {
    expect(handle.breadcrumb()).toEqual({ label: "Search", to: "/search" });
  });
});
