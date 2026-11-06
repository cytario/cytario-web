import { renderHook } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, test, vi } from "vitest";

import { useActiveOrg, useOrgPath } from "../useOrgPath";
import { useCurrentUser } from "~/hooks/useCurrentUser";

vi.mock("~/hooks/useCurrentUser", () => ({
  useCurrentUser: vi.fn(),
}));

const mockUser = (organizations: Record<string, { groups: string[] }> | undefined) =>
  vi.mocked(useCurrentUser).mockReturnValue({
    organizations,
  } as unknown as ReturnType<typeof useCurrentUser>);

afterEach(() => {
  vi.resetAllMocks();
});

describe("useActiveOrg / useOrgPath", () => {
  test("the URL's org segment wins over any other source", () => {
    // A tab switched to /zeta while the preference still says alpha: links
    // must be built for zeta, not the stale pointer org.
    mockUser({ alpha: { groups: [] }, zeta: { groups: [] } });

    const { result: active } = renderHook(() => useActiveOrg(), {
      wrapper: ({ children }) => (
        <MemoryRouter initialEntries={["/zeta/"]}>{children}</MemoryRouter>
      ),
    });
    const { result: orgPath } = renderHook(() => useOrgPath(), {
      wrapper: ({ children }) => (
        <MemoryRouter initialEntries={["/zeta/"]}>{children}</MemoryRouter>
      ),
    });

    expect(active.current).toBe("zeta");
    expect(orgPath.current("/")).toBe("/zeta");
    expect(orgPath.current("/recent")).toBe("/zeta/recent");
  });

  test("falls back to the first membership alias outside an org-prefixed route", () => {
    mockUser({ alpha: { groups: [] } });

    const { result } = renderHook(() => useActiveOrg(), {
      wrapper: ({ children }) => (
        <MemoryRouter initialEntries={["/login"]}>{children}</MemoryRouter>
      ),
    });

    expect(result.current).toBe("alpha");
  });

  test("a reserved top-level route is never an organization", () => {
    mockUser({ alpha: { groups: [] } });

    const { result } = renderHook(() => useActiveOrg(), {
      wrapper: ({ children }) => (
        <MemoryRouter initialEntries={["/recent"]}>{children}</MemoryRouter>
      ),
    });

    expect(result.current).toBe("alpha");
  });

  test("a URL-encoded alias decodes before building paths", () => {
    mockUser({ alpha: { groups: [] } });

    const { result } = renderHook(() => useActiveOrg(), {
      wrapper: ({ children }) => (
        <MemoryRouter initialEntries={["/acme%20corp/"]}>{children}</MemoryRouter>
      ),
    });

    expect(result.current).toBe("acme corp");
  });
});
