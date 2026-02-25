import { redis } from "../../db/redis";
import { sessionStorage } from "../sessionStorage";
import type { SessionData } from "../sessionStorage";
import mock from "~/utils/__tests__/__mocks__";

vi.mock("../../db/redis", () => ({
  redis: {
    hset: vi.fn(),
    hget: vi.fn(),
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
    vi.mocked(redis.hdel).mockResolvedValue(1);
  });

  describe("getSession / commitSession integration", () => {
    test("creates and reads session via cookie", async () => {
      vi.mocked(redis.hget).mockResolvedValue(JSON.stringify(mockSessionData));

      // Get empty session from request without cookie
      const request = new Request("http://localhost/");
      const session = await sessionStorage.getSession(
        request.headers.get("Cookie")
      );

      expect(session).toBeDefined();
      expect(session.id).toBe("");
    });

    test("commitSession returns Set-Cookie header", async () => {
      const request = new Request("http://localhost/");
      const session = await sessionStorage.getSession(
        request.headers.get("Cookie")
      );

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
      const session = await sessionStorage.getSession(
        request.headers.get("Cookie")
      );

      session.set("user", mockUser);
      session.set("authTokens", mockSessionData.authTokens);
      session.set("credentials", {});

      await sessionStorage.commitSession(session, {
        expires: mockExpires,
      });

      const sessionId = vi.mocked(redis.hset).mock.calls[0][0] as string;
      // Session ID should be a UUID, not user.sub
      expect(sessionId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
      expect(sessionId).not.toBe("user-123");
    });

    test("sets session expiry in Redis", async () => {
      const request = new Request("http://localhost/");
      const session = await sessionStorage.getSession(
        request.headers.get("Cookie")
      );

      session.set("user", mockUser);
      session.set("authTokens", mockSessionData.authTokens);
      session.set("credentials", {});

      await sessionStorage.commitSession(session, {
        expires: mockExpires,
      });

      expect(redis.expireat).toHaveBeenCalledWith(
        expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
        ),
        Math.floor(mockExpires.getTime() / 1000)
      );
    });

    test("always uses randomUUID for session ID, never user.sub", async () => {
      const request = new Request("http://localhost/");
      const session = await sessionStorage.getSession(
        request.headers.get("Cookie")
      );

      session.set("user", mock.user({ sub: "custom-user-id" }));
      session.set("authTokens", mockSessionData.authTokens);
      session.set("credentials", {});

      await sessionStorage.commitSession(session, {
        expires: mockExpires,
      });

      const sessionId = vi.mocked(redis.hset).mock.calls[0][0] as string;
      expect(sessionId).not.toBe("custom-user-id");
      expect(sessionId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
    });
  });

  describe("readData", () => {
    test("reads session data from Redis when session exists", async () => {
      vi.mocked(redis.hget).mockResolvedValue(JSON.stringify(mockSessionData));

      // Simulate reading a session with a known ID
      const session = await sessionStorage.getSession("__session=user-123");

      // The session storage should have attempted to read from Redis
      expect(redis.hget).toHaveBeenCalled();
      expect(session).toBeDefined();
    });

    test("returns empty data for missing session", async () => {
      vi.mocked(redis.hget).mockResolvedValue(null);

      const session = await sessionStorage.getSession("__session=nonexistent");

      // Session exists but has no data
      expect(session.data).toEqual({});
    });
  });

  describe("destroySession", () => {
    test("returns cookie header that clears session", async () => {
      const request = new Request("http://localhost/");
      const session = await sessionStorage.getSession(
        request.headers.get("Cookie")
      );

      session.set("user", mockUser);

      const header = await sessionStorage.destroySession(session);

      expect(header).toContain("__session=");
      // React Router uses Expires=Thu, 01 Jan 1970 to clear cookies
      expect(header).toContain("Expires=Thu, 01 Jan 1970");
    });
  });
});
