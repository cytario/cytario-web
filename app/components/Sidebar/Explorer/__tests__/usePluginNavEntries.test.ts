import { renderHook, waitFor } from "@testing-library/react";
import { vi } from "vitest";

import type { Identity } from "@cytario/plugin-api";
import { sidebarNavRegistry } from "~/components/sidebarNavRegistry";

// usePluginNavEntries imports useRouteLoaderData + useNavigate from
// react-router — mock both so the hook runs without a router context.
vi.mock("react-router", () => ({
  useNavigate: vi.fn(() => mockNavigate),
  useRouteLoaderData: vi.fn(() => ({ identity: mockIdentity })),
}));

const mockNavigate = vi.fn();
const mockIdentity: Identity = {
  sub: "test-user",
  organization: "testcorp",
  organizationAttributes: {},
  groups: [],
  adminScopes: [],
};

// Imported after the mock is installed so usePluginNavEntries picks up the
// mocked react-router module.
const { usePluginNavEntries } = await import("~/components/Sidebar/Explorer/usePluginNavEntries");

describe("usePluginNavEntries", () => {
  beforeEach(() => {
    sidebarNavRegistry.__reset();
    mockNavigate.mockClear();
  });

  test("threads a router navigate into the activation context", async () => {
    sidebarNavRegistry.scopedFor("test-plugin").register("nav", {
      id: "jobs",
      label: "Jobs",
      to: "/jobs",
      onActivate(ctx) {
        ctx.navigate("/jobs/123");
      },
    });

    const { result } = renderHook(() => usePluginNavEntries());
    await waitFor(() => expect(result.current).toHaveLength(1));

    const ctx = result.current[0]!.activationContext;
    expect(typeof ctx.navigate).toBe("function");

    // The host wraps navigate so a plugin's app-relative path lands inside the
    // active organization; no organization in this fixture leaves it as-is.
    ctx.navigate("/jobs/123");
    expect(mockNavigate).toHaveBeenCalledWith("/jobs/123");
  });

  test("onActivate can call navigate to override the static to", async () => {
    const calls: string[] = [];
    sidebarNavRegistry.scopedFor("test-plugin").register("nav", {
      id: "analyze",
      label: "Analyze",
      to: "/analyze",
      onActivate(ctx) {
        calls.push("activated");
        ctx.navigate("/analyze/123?file=sample.zarr");
      },
    });

    const { result } = renderHook(() => usePluginNavEntries());
    await waitFor(() => expect(result.current).toHaveLength(1));

    const entry = result.current[0]!;
    entry.entry.onActivate?.(entry.activationContext);

    expect(calls).toEqual(["activated"]);
    expect(mockNavigate).toHaveBeenCalledWith("/analyze/123?file=sample.zarr");
  });
});
