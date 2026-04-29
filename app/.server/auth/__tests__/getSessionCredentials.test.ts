import {
  AssumeRoleWithWebIdentityCommand,
  STSClient,
} from "@aws-sdk/client-sts";

import {
  getAllSessionCredentials,
  isValidCredentials,
  sanitizeRoleSessionName,
} from "../getSessionCredentials";
import type { SessionData } from "../sessionStorage";
import mock from "~/utils/__tests__/__mocks__";

vi.mock("@aws-sdk/client-sts", () => ({
  STSClient: vi.fn(),
  AssumeRoleWithWebIdentityCommand: vi.fn(),
}));

vi.mock("~/utils/s3Provider", () => ({
  getS3ProviderConfig: vi.fn(() => ({
    stsEndpoint: "https://sts.us-east-1.amazonaws.com",
  })),
}));

describe("isValidCredentials", () => {
  test("returns false when credentials are undefined", () => {
    expect(isValidCredentials(undefined)).toBe(false);
  });

  test("returns false when Expiration is undefined", () => {
    expect(isValidCredentials({})).toBe(false);
  });

  test("returns false when credentials are expired", () => {
    const expired = { Expiration: new Date(Date.now() - 60 * 1000) };
    expect(isValidCredentials(expired)).toBe(false);
  });

  test("returns false when credentials expire within 5 minute buffer", () => {
    const nearExpiry = { Expiration: new Date(Date.now() + 3 * 60 * 1000) };
    expect(isValidCredentials(nearExpiry)).toBe(false);
  });

  test("returns true when credentials are valid (beyond 5 minute buffer)", () => {
    const valid = { Expiration: new Date(Date.now() + 10 * 60 * 1000) };
    expect(isValidCredentials(valid)).toBe(true);
  });
});

describe("sanitizeRoleSessionName", () => {
  test("replaces spaces with hyphens", () => {
    expect(sanitizeRoleSessionName("Test User")).toBe("Test-User");
  });

  test("handles Unicode characters like Müller", () => {
    expect(sanitizeRoleSessionName("Müller")).toBe("M-ller");
  });

  test("collapses consecutive hyphens", () => {
    expect(sanitizeRoleSessionName("a   b")).toBe("a-b");
  });

  test("preserves valid AWS chars (letters, digits, +=,.@-)", () => {
    expect(sanitizeRoleSessionName("user+=,.@-name")).toBe("user+=,.@-name");
  });

  test("truncates to 64 characters", () => {
    const longName = "a".repeat(100);
    expect(sanitizeRoleSessionName(longName)).toHaveLength(64);
  });

  test("falls back to cytario-session for empty string", () => {
    expect(sanitizeRoleSessionName("")).toBe("cytario-session");
  });

  test("falls back to cytario-session for single char result", () => {
    expect(sanitizeRoleSessionName("!")).toBe("cytario-session");
  });

  test("handles already valid names", () => {
    expect(sanitizeRoleSessionName("valid-name")).toBe("valid-name");
  });
});

describe("getAllSessionCredentials", () => {
  const mockSend = vi.fn();
  const mockCredentials = mock.credentials();

  const mockSessionData: SessionData = {
    user: mock.user({ sub: "user-123", name: "Test User" }),
    authTokens: {
      accessToken: "access-token",
      idToken: "id-token-for-sts",
      refreshToken: "refresh-token",
    },
    credentials: {},
  };

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(STSClient).mockImplementation(
      () =>
        ({
          send: mockSend,
        }) as unknown as STSClient,
    );

    mockSend.mockResolvedValue({
      Credentials: mockCredentials,
    });
  });

  test("returns existing credentials when all are valid", async () => {
    const validCredentials = {
      "conn-a": mock.credentials(),
    };
    const sessionData = {
      ...mockSessionData,
      credentials: validCredentials,
    };

    const result = await getAllSessionCredentials(sessionData, [
      mock.connectionConfig({ name: "conn-a" }),
    ]);

    expect(result).toBe(validCredentials);
    expect(mockSend).not.toHaveBeenCalled();
  });

  test("fetches credentials for connections with missing credentials", async () => {
    const result = await getAllSessionCredentials(mockSessionData, [
      mock.connectionConfig({ name: "new-conn" }),
    ]);

    expect(result).toEqual({ "new-conn": mockCredentials });
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  test("fetches credentials for connections with expired credentials", async () => {
    const sessionData = {
      ...mockSessionData,
      credentials: {
        "expired-conn": mock.credentials({
          Expiration: new Date(Date.now() - 60 * 1000),
        }),
      },
    };

    const result = await getAllSessionCredentials(sessionData, [
      mock.connectionConfig({ name: "expired-conn" }),
    ]);

    expect(result).toEqual({ "expired-conn": mockCredentials });
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  test("mints separately for connections sharing a bucket but differing in role", async () => {
    const configs = [
      mock.connectionConfig({
        name: "internal",
        bucketName: "shared-bucket",
        roleArn: "arn:aws:iam::123:role/internal",
      }),
      mock.connectionConfig({
        name: "external",
        bucketName: "shared-bucket",
        roleArn: "arn:aws:iam::123:role/external",
      }),
    ];

    const result = await getAllSessionCredentials(mockSessionData, configs);

    // No bucket dedup — each connection gets its own STS mint.
    expect(mockSend).toHaveBeenCalledTimes(2);
    expect(result["internal"]).toEqual(mockCredentials);
    expect(result["external"]).toEqual(mockCredentials);
  });

  test("fetches multiple connections in parallel", async () => {
    const configs = [
      mock.connectionConfig({ name: "conn-a" }),
      mock.connectionConfig({ name: "conn-b" }),
    ];

    const result = await getAllSessionCredentials(mockSessionData, configs);

    expect(mockSend).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      "conn-a": mockCredentials,
      "conn-b": mockCredentials,
    });
  });

  test("preserves existing valid credentials when fetching new ones", async () => {
    const existingCredentials = mock.credentials();
    const sessionData = {
      ...mockSessionData,
      credentials: { "existing-conn": existingCredentials },
    };

    const result = await getAllSessionCredentials(sessionData, [
      mock.connectionConfig({ name: "existing-conn" }),
      mock.connectionConfig({ name: "new-conn" }),
    ]);

    expect(result["existing-conn"]).toBe(existingCredentials);
    expect(result["new-conn"]).toEqual(mockCredentials);
    // Only fetched for new-conn, not existing-conn
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  test("handles partial failures gracefully", async () => {
    mockSend
      .mockResolvedValueOnce({ Credentials: mockCredentials })
      .mockRejectedValueOnce(new Error("STS service unavailable"));

    const configs = [
      mock.connectionConfig({ name: "conn-a" }),
      mock.connectionConfig({ name: "conn-b" }),
    ];

    const result = await getAllSessionCredentials(mockSessionData, configs);

    // conn-a succeeds, conn-b fails silently
    expect(result["conn-a"]).toEqual(mockCredentials);
    expect(result["conn-b"]).toBeUndefined();
  });

  test("calls STS with correct configuration", async () => {
    await getAllSessionCredentials(mockSessionData, [
      mock.connectionConfig({
        bucketName: "test-bucket",
        roleArn: "arn:aws:iam::123456789012:role/test-role",
        region: "us-west-2",
      }),
    ]);

    expect(STSClient).toHaveBeenCalledWith({
      endpoint: "https://sts.us-east-1.amazonaws.com",
      region: "us-west-2",
    });

    expect(AssumeRoleWithWebIdentityCommand).toHaveBeenCalledWith({
      RoleArn: "arn:aws:iam::123456789012:role/test-role",
      RoleSessionName: "Test-User",
      WebIdentityToken: "id-token-for-sts",
      DurationSeconds: 3600,
    });
  });

  test("returns empty credentials when no bucket configs provided", async () => {
    const result = await getAllSessionCredentials(mockSessionData, []);

    expect(result).toBe(mockSessionData.credentials);
    expect(mockSend).not.toHaveBeenCalled();
  });
});
