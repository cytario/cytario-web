import { getSession } from "../getSession";
import { sessionMiddleware, sessionContext } from "../sessionMiddleware";
import mock from "~/utils/__tests__/__mocks__";

vi.mock("../getSession", () => ({
  getSession: vi.fn(),
}));

describe("sessionMiddleware", () => {
  const mockNext = vi.fn().mockResolvedValue(new Response("OK"));
  const mockSession = mock.session();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSession).mockResolvedValue(mockSession);
  });

  const createMiddlewareArgs = () => {
    const contextMap = new Map();
    return {
      request: new Request("http://localhost/test"),
      params: {},
      context: {
        get: (key: unknown) => contextMap.get(key),
        set: vi.fn((key: unknown, value: unknown) =>
          contextMap.set(key, value)
        ),
      },
    };
  };

  test("retrieves session from request", async () => {
    const args = createMiddlewareArgs();
    const request = args.request;

    await sessionMiddleware(
      args as unknown as Parameters<typeof sessionMiddleware>[0],
      mockNext
    );

    expect(getSession).toHaveBeenCalledWith(request);
  });

  test("sets session in context", async () => {
    const args = createMiddlewareArgs();

    await sessionMiddleware(
      args as unknown as Parameters<typeof sessionMiddleware>[0],
      mockNext
    );

    expect(args.context.set).toHaveBeenCalledWith(sessionContext, mockSession);
  });

  test("calls next() after setting session", async () => {
    const args = createMiddlewareArgs();

    await sessionMiddleware(
      args as unknown as Parameters<typeof sessionMiddleware>[0],
      mockNext
    );

    expect(mockNext).toHaveBeenCalled();
  });

  test("returns result from next()", async () => {
    const args = createMiddlewareArgs();
    const expectedResponse = new Response("Test Response");
    mockNext.mockResolvedValueOnce(expectedResponse);

    const result = await sessionMiddleware(
      args as unknown as Parameters<typeof sessionMiddleware>[0],
      mockNext
    );

    expect(result).toBe(expectedResponse);
  });

  test("propagates errors from getSession", async () => {
    const args = createMiddlewareArgs();
    vi.mocked(getSession).mockRejectedValue(new Error("Session error"));

    await expect(
      sessionMiddleware(
        args as unknown as Parameters<typeof sessionMiddleware>[0],
        mockNext
      )
    ).rejects.toThrow("Session error");

    expect(mockNext).not.toHaveBeenCalled();
  });
});
