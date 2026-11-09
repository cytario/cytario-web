import { describe, expect, test } from "vitest";

import { shouldRevalidate } from "../connections.route";

const url = (pathname: string) => new URL(pathname, "https://app.test") as unknown as URL;

const args = (current: string, next: string) => ({
  currentUrl: url(current),
  nextUrl: url(next),
  currentParams: {},
  nextParams: {},
  formAction: undefined,
  defaultShouldRevalidate: false,
});

describe("connections list revalidation", () => {
  test("revalidates when the URL's organization segment changes", () => {
    // An org switch navigates /acme -> /beta while staying on this route;
    // without revalidation the list keeps rendering the previous tenant.
    expect(shouldRevalidate(args("/acme", "/beta"))).toBe(true);
  });

  test("revalidates when the form action changes", () => {
    expect(
      shouldRevalidate({
        ...args("/acme", "/acme"),
        formAction: "/acme" as unknown as undefined,
        defaultShouldRevalidate: true,
      }),
    ).toBe(true);
  });

  test("stays cached for a same-org navigation", () => {
    expect(shouldRevalidate(args("/acme", "/acme"))).toBe(false);
  });
});
