import { createContext } from "react-router";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { type SessionData } from "~/.server/auth/sessionStorage";

vi.mock("~/.server/auth/authMiddleware", () => ({
  authContext: createContext<Partial<SessionData>>(),
  authMiddleware: vi.fn(async (_args, next) => next()),
}));

const { authContext } = await import("~/.server/auth/authMiddleware");
const { loader } = await import("../legacyRedirect.layout");

const runLoader = async (path: string, activeOrganization: string | undefined = "acme") => {
  const request = new Request(`http://localhost${path}`);
  const values = new Map<unknown, unknown>([[authContext, { activeOrganization }]]);
  return loader({
    request,
    params: {},
    context: { get: (key: unknown) => values.get(key), set: vi.fn() },
    pattern: "",
    url: new URL(request.url),
  } as never);
};

/** A session that resolved no organization at all. */
const runLoaderWithoutOrg = async (path: string) => {
  const request = new Request(`http://localhost${path}`);
  const values = new Map<unknown, unknown>([[authContext, { activeOrganization: undefined }]]);
  return loader({
    request,
    params: {},
    context: { get: (key: unknown) => values.get(key), set: vi.fn() },
    pattern: "",
    url: new URL(request.url),
  } as never);
};

describe("legacy redirect loader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("sends an un-prefixed app path into the active organization", async () => {
    const response = (await runLoader("/connections/abc/a/b")) as Response;

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/o/acme/connections/abc/a/b");
  });

  test("sends the un-prefixed root to the organization root", async () => {
    const response = (await runLoader("/")) as Response;

    expect(response.headers.get("Location")).toBe("/o/acme");
  });

  test("preserves the query string", async () => {
    const response = (await runLoader("/admin/users?scope=lab")) as Response;

    expect(response.headers.get("Location")).toBe("/o/acme/admin/users?scope=lab");
  });

  test("answers 404 for a path that did not move", async () => {
    expect(await thrownStatus(runLoader("/nonsense"))).toBe(404);
  });

  test("answers 404 rather than redirecting when the session has no organization", async () => {
    expect(await thrownStatus(runLoaderWithoutOrg("/connections"))).toBe(404);
  });
});

/** The status of the Response a loader threw, or `undefined` when it did not throw
 *  one. Duck-typed: the thrown Response resolves from react-router's own module
 *  graph, so it is not always an instance of the environment's global. */
async function thrownStatus(result: Promise<unknown>): Promise<number | undefined> {
  try {
    await result;
    return undefined;
  } catch (thrown) {
    const status = (thrown as { status?: unknown })?.status;
    return typeof status === "number" ? status : undefined;
  }
}
