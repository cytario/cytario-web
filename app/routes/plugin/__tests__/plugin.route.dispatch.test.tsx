import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { routeRegistry } from "~/.server/routeRegistry";
import { clientRouteRegistry } from "~/lib/clientRouteRegistry";
import { action, default as PluginRoute, loader } from "~/routes/plugin/plugin.$";
import mock from "~/utils/__tests__/__mocks__";

// Real `authContext` token; the route reads the resolved user off it.
const authContext = vi
  .importActual<typeof import("~/.server/auth/authMiddleware")>("~/.server/auth/authMiddleware")
  .then((m) => m.authContext);

vi.mock("~/.server/auth/getUserInfo", () => ({
  toIdentity: vi.fn((user: { organization?: string }) => ({
    organization: user.organization,
    organizationAttributes: {},
    groups: [],
    adminScopes: [],
  })),
}));

// `useLocation` is a hook the default export relies on; stub it to the
// current test path so the client registry lookup can be exercised.
vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>();
  let pathname = "/";
  return {
    ...actual,
    useLocation: () => ({ pathname }) as Location,
    __setPathname: (p: string) => {
      pathname = p;
    },
  };
});

beforeEach(() => {
  routeRegistry.__reset();
  clientRouteRegistry.__reset();
  vi.clearAllMocks();
});

function buildArgs(method: string, splat: string) {
  const ctx = new Map<unknown, unknown>();
  return {
    request: new Request(`http://localhost/plugin/${splat}`, { method }),
    params: { "*": splat },
    context: {
      get: (k: unknown) => ctx.get(k),
      set: (k: unknown, v: unknown) => ctx.set(k, v),
    },
  } as unknown as Parameters<typeof loader>[0];
}

async function seedAuthUser(args: Parameters<typeof loader>[0]) {
  const token = await authContext;
  (args.context as unknown as { set: (k: unknown, v: unknown) => void }).set(token, {
    user: mock.user(),
  });
}

describe("/plugin/* server dispatch (SDS-CY-010093/010094)", () => {
  test("loader delegates to the contributed loader with the resolved identity", async () => {
    const { toIdentity } = await import("~/.server/auth/getUserInfo");
    const loaderFn = vi.fn(async () => Response.json({ jobs: [] }));

    routeRegistry.scopedFor("compute-plugin").register({
      path: "/plugin/jobs",
      loader: loaderFn,
    });

    const args = buildArgs("GET", "jobs");
    await seedAuthUser(args);
    const response = (await loader(args)) as Response;

    expect(toIdentity).toHaveBeenCalledOnce();
    expect(loaderFn).toHaveBeenCalledWith({
      request: args.request,
      params: { "*": "jobs" },
      identity: { organization: "org1", organizationAttributes: {}, groups: [], adminScopes: [] },
    });
    expect(await response.json()).toEqual({ jobs: [] });
  });

  test("action delegates to the contributed action", async () => {
    const actionFn = vi.fn(async () => Response.json({ ok: true }));

    routeRegistry.scopedFor("compute-plugin").register({
      path: "/plugin/analyze",
      action: actionFn,
    });

    const args = buildArgs("POST", "analyze");
    await seedAuthUser(args);
    await action(args);

    expect(actionFn).toHaveBeenCalledOnce();
    expect(actionFn).toHaveBeenCalledWith(
      expect.objectContaining({ identity: expect.any(Object) }),
    );
  });

  test("returns 404 for an unmatched /plugin path", async () => {
    const response = (await loader(buildArgs("GET", "nope"))) as Response;
    expect(response.status).toBe(404);
  });

  test("returns 404 when the contribution has no loader", async () => {
    routeRegistry.scopedFor("compute-plugin").register({
      path: "/plugin/action-only",
      action: async () => Response.json({ ok: true }),
    });

    const response = (await loader(buildArgs("GET", "action-only"))) as Response;
    expect(response.status).toBe(404);
  });
});

describe("/plugin/* client render (SDS-CY-010083/010093)", () => {
  test("renders the contributed element for a matched path", async () => {
    const { __setPathname } = (await import("react-router")) as typeof import("react-router") & {
      __setPathname: (p: string) => void;
    };
    __setPathname("/plugin/jobs");

    const JobsPage = () => <div data-testid="jobs-page">Jobs</div>;
    clientRouteRegistry.scopedFor("compute-plugin").register({
      path: "/plugin/jobs",
      element: JobsPage,
    });

    render(<PluginRoute />);
    expect(screen.getByTestId("jobs-page")).toBeDefined();
  });

  test("renders a placeholder when no element is registered for the path", async () => {
    const { __setPathname } = (await import("react-router")) as typeof import("react-router") & {
      __setPathname: (p: string) => void;
    };
    __setPathname("/plugin/unknown");

    render(<PluginRoute />);
    expect(screen.getByText("Plugin route not configured.")).toBeDefined();
  });

  test("renders a placeholder when the contributed element is not callable (SDS-CY-010083 guard)", async () => {
    const { __setPathname } = (await import("react-router")) as typeof import("react-router") & {
      __setPathname: (p: string) => void;
    };
    __setPathname("/plugin/broken");

    clientRouteRegistry.scopedFor("bad-plugin").register({
      path: "/plugin/broken",
      element: { not: "a component" } as unknown,
    });

    render(<PluginRoute />);
    expect(screen.getByText("Plugin route not configured.")).toBeDefined();
  });
});
