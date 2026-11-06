import { redis } from "../../db/redis";
import { sessionStorage } from "../sessionStorage";
import type { SessionData } from "../sessionStorage";
import mock from "~/utils/__tests__/__mocks__";

vi.mock("../../db/redis", () => ({
  redis: {
    hset: vi.fn(),
    hget: vi.fn(),
    hmget: vi.fn(),
    hincrby: vi.fn(),
    hdel: vi.fn(),
    expireat: vi.fn(),
  },
}));

vi.mock("~/config", () => ({
  cytarioConfig: {
    cookie: {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      // The real cookie is signed; without a secret the cookie parse fails
      // and getSession can never resolve an existing session id.
      secrets: ["test-secret"],
    },
  },
}));

describe("sessionStorage", () => {
  const mockUser = mock.user({ sub: "user-123" });
  const mockSessionData: SessionData = {
    user: mockUser,
    authTokens: {
      accessToken: "access-token",
      idToken: "id-token",
      refreshToken: "refresh-token",
    },
    credentials: {},
  };

  const mockExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(redis.hset).mockResolvedValue(1);
    vi.mocked(redis.expireat).mockResolvedValue(1);
    vi.mocked(redis.hget).mockResolvedValue(null);
    // A pre-existing session reads back at epoch "1" with its data.
    vi.mocked(redis.hmget).mockResolvedValue(["1"]);
    vi.mocked(redis.hincrby).mockResolvedValue(1);
    vi.mocked(redis.hdel).mockResolvedValue(1);
  });

  describe("getSession / commitSession integration", () => {
    test("creates and reads session via cookie", async () => {
      const request = new Request("http://localhost/");
      const session = await sessionStorage.getSession(request.headers.get("Cookie"));

      expect(session).toBeDefined();
      expect(session.id).toBe("");
    });

    test("commitSession returns Set-Cookie header", async () => {
      const request = new Request("http://localhost/");
      const session = await sessionStorage.getSession(request.headers.get("Cookie"));

      session.set("user", mockUser);
      session.set("authTokens", mockSessionData.authTokens);
      session.set("credentials", {});

      const header = await sessionStorage.commitSession(session, {
        expires: mockExpires,
      });

      expect(header).toContain("__session=");
      expect(header).toContain("HttpOnly");
    });
  });

  describe("createData", () => {
    test("stores session data in Redis with UUID session ID", async () => {
      const request = new Request("http://localhost/");
      const session = await sessionStorage.getSession(request.headers.get("Cookie"));

      session.set("user", mockUser);
      session.set("authTokens", mockSessionData.authTokens);
      session.set("credentials", {});

      await sessionStorage.commitSession(session, {
        expires: mockExpires,
      });

      const sessionId = vi.mocked(redis.hset).mock.calls[0][0] as string;
      // Session ID should be a UUID, not user.sub
      expect(sessionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(sessionId).not.toBe("user-123");
    });

    test("sets session expiry in Redis", async () => {
      const request = new Request("http://localhost/");
      const session = await sessionStorage.getSession(request.headers.get("Cookie"));

      session.set("user", mockUser);
      session.set("authTokens", mockSessionData.authTokens);
      session.set("credentials", {});

      await sessionStorage.commitSession(session, {
        expires: mockExpires,
      });

      expect(redis.expireat).toHaveBeenCalledWith(
        expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/),
        Math.floor(mockExpires.getTime() / 1000),
      );
    });

    test("always uses randomUUID for session ID, never user.sub", async () => {
      const request = new Request("http://localhost/");
      const session = await sessionStorage.getSession(request.headers.get("Cookie"));

      session.set("user", mock.user({ sub: "custom-user-id" }));
      session.set("authTokens", mockSessionData.authTokens);
      session.set("credentials", {});

      await sessionStorage.commitSession(session, {
        expires: mockExpires,
      });

      const sessionId = vi.mocked(redis.hset).mock.calls[0][0] as string;
      expect(sessionId).not.toBe("custom-user-id");
      expect(sessionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });
  });

  /**
   * Creates a session via the storage itself and returns its id plus a
   * signed cookie header that resolves back to it — the only reliable way
   * to exercise read paths, since the storage signs its cookies.
   */
  const createSessionAndGetCookie = async (): Promise<{
    id: string;
    cookie: string;
  }> => {
    const fresh = await sessionStorage.getSession();
    fresh.set("user", mockUser);
    fresh.set("authTokens", mockSessionData.authTokens);
    fresh.set("credentials", {});
    const setCookie = await sessionStorage.commitSession(fresh, {
      expires: mockExpires,
    });
    const id = (vi.mocked(redis.hset).mock.calls[0][0] as string) ?? "";
    const cookie = setCookie.split(";")[0];
    return { id, cookie };
  };

  describe("readData", () => {
    test("reads session data from Redis when session exists", async () => {
      const { cookie } = await createSessionAndGetCookie();
      vi.mocked(redis.hset).mockClear();
      vi.mocked(redis.hmget).mockResolvedValue(["1"]);
      vi.mocked(redis.hget).mockResolvedValue(JSON.stringify(mockSessionData));

      const session = await sessionStorage.getSession(cookie);

      expect(redis.hmget).toHaveBeenCalled();
      expect(session.get("user")).toEqual(mockSessionData.user);
    });

    test("returns empty data for missing session", async () => {
      // A cookie for a session this process never saw (and Redis has lost).
      // Hand-signed with the mock secret so the parse resolves the id.
      const value = Buffer.from(JSON.stringify("ghost-session-id")).toString("base64");
      const { createHmac } = await import("node:crypto");
      const hash = createHmac("sha256", "test-secret")
        .update(value)
        .digest("base64")
        .replace(/=+$/, "");
      vi.mocked(redis.hmget).mockResolvedValue([null]);
      vi.mocked(redis.hget).mockResolvedValue(null);

      const session = await sessionStorage.getSession(`__session=${value}.${hash}`);

      expect(session.data).toEqual({});
    });

    test("treats a session written before the epoch field existed as epoch 0", async () => {
      const { cookie } = await createSessionAndGetCookie();
      // epoch absent (a session created by an older build); data still there
      vi.mocked(redis.hmget).mockResolvedValue([null]);
      vi.mocked(redis.hget).mockResolvedValue(JSON.stringify(mockSessionData));

      const session = await sessionStorage.getSession(cookie);

      expect(session.get("user")).toEqual(mockSessionData.user);
    });
  });

  describe("epoch invalidation", () => {
    test("a write bumps the epoch so another replica's cached copy misses", async () => {
      const { cookie } = await createSessionAndGetCookie();
      vi.mocked(redis.hset).mockClear();

      // Replica A reads the session at epoch 1 (populating its local cache)…
      vi.mocked(redis.hmget).mockResolvedValue(["1"]);
      vi.mocked(redis.hget).mockResolvedValue(JSON.stringify(mockSessionData));
      await sessionStorage.getSession(cookie);

      // …a write (anywhere) bumps the epoch to 2 and changes the payload…
      vi.mocked(redis.hmget).mockResolvedValue(["2"]);
      const rewrittenSessionData: SessionData = {
        ...mockSessionData,
        user: { ...mockSessionData.user, sub: "beta-sub" },
      };
      vi.mocked(redis.hget).mockResolvedValue(JSON.stringify(rewrittenSessionData));

      // …replica A (the same process here) reads again: the epoch differs
      // from what it cached, so the payload comes from Redis and reflects
      // the write — a stale cached copy was never served.
      const session = await sessionStorage.getSession(cookie);
      expect(session.get("user")).toEqual(rewrittenSessionData.user);
      expect(redis.hget).toHaveBeenCalledTimes(2);
    });

    test("a read at the same epoch is served from the local cache", async () => {
      const { cookie } = await createSessionAndGetCookie();
      vi.mocked(redis.hset).mockClear();

      vi.mocked(redis.hmget).mockResolvedValue(["3"]);
      vi.mocked(redis.hget).mockResolvedValue(JSON.stringify(mockSessionData));
      await sessionStorage.getSession(cookie);
      await sessionStorage.getSession(cookie);

      // Burst reads at an unchanged epoch transfer the payload once.
      expect(redis.hget).toHaveBeenCalledTimes(1);
      expect(redis.hmget).toHaveBeenCalledTimes(2);
    });

    test("updateData increments the epoch field", async () => {
      const { cookie } = await createSessionAndGetCookie();
      vi.mocked(redis.hset).mockClear();

      const session = await sessionStorage.getSession(cookie);
      session.set("user", { ...mockSessionData.user, sub: "beta-sub" });

      await sessionStorage.commitSession(session, { expires: mockExpires });

      expect(redis.hincrby).toHaveBeenCalledWith(expect.any(String), "epoch", 1);
    });
  });

  describe("destroySession", () => {
    test("returns cookie header that clears session", async () => {
      const request = new Request("http://localhost/");
      const session = await sessionStorage.getSession(request.headers.get("Cookie"));

      session.set("user", mockUser);

      const header = await sessionStorage.destroySession(session);

      expect(header).toContain("__session=");
      // React Router uses Expires=Thu, 01 Jan 1970 to clear cookies
      expect(header).toContain("Expires=Thu, 01 Jan 1970");
    });
  });
});
