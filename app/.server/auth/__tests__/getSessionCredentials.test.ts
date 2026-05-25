import { AssumeRoleWithWebIdentityCommand, STSClient } from "@aws-sdk/client-sts";

import {
  getAllSessionCredentials,
  isValidCredentials,
  sanitizeRoleSessionName,
} from "../getSessionCredentials";
import { buildSessionPolicy } from "../sessionPolicy";
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

    expect(result.credentials).toBe(validCredentials);
    expect(result.errors).toEqual({});
    expect(mockSend).not.toHaveBeenCalled();
  });

  test("fetches credentials for connections with missing credentials", async () => {
    const result = await getAllSessionCredentials(mockSessionData, [
      mock.connectionConfig({ name: "new-conn" }),
    ]);

    expect(result.credentials).toEqual({ "new-conn": mockCredentials });
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

    expect(result.credentials).toEqual({ "expired-conn": mockCredentials });
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
    expect(result.credentials["internal"]).toEqual(mockCredentials);
    expect(result.credentials["external"]).toEqual(mockCredentials);
  });

  test("fetches multiple connections in parallel", async () => {
    const configs = [
      mock.connectionConfig({ name: "conn-a" }),
      mock.connectionConfig({ name: "conn-b" }),
    ];

    const result = await getAllSessionCredentials(mockSessionData, configs);

    expect(mockSend).toHaveBeenCalledTimes(2);
    expect(result.credentials).toEqual({
      "conn-a": mockCredentials,
      "conn-b": mockCredentials,
    });
    expect(result.errors).toEqual({});
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

    expect(result.credentials["existing-conn"]).toBe(existingCredentials);
    expect(result.credentials["new-conn"]).toEqual(mockCredentials);
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

    // conn-a succeeds, conn-b fails — reason recorded in errors map
    expect(result.credentials["conn-a"]).toEqual(mockCredentials);
    expect(result.credentials["conn-b"]).toBeUndefined();
    expect(result.errors["conn-b"]).toBe("STS service unavailable");
  });

  test("classifies STS AccessDenied as a role-trust-policy hint", async () => {
    const denied = Object.assign(
      new Error("Not authorized to perform sts:AssumeRoleWithWebIdentity"),
      {
        name: "AccessDenied",
      },
    );
    mockSend.mockRejectedValueOnce(denied);

    const result = await getAllSessionCredentials(mockSessionData, [
      mock.connectionConfig({ name: "blocked" }),
    ]);

    expect(result.credentials["blocked"]).toBeUndefined();
    expect(result.errors["blocked"]).toMatch(/AWS STS denied AssumeRoleWithWebIdentity/);
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
      Policy: buildSessionPolicy({
        organization: "org1",
        bucketName: "test-bucket",
        prefix: "",
        region: "us-west-2",
      }),
    });
  });

  test("AWS connection: AssumeRoleWithWebIdentityCommand receives inline session Policy", async () => {
    await getAllSessionCredentials(mockSessionData, [
      mock.connectionConfig({
        provider: "aws",
        bucketName: "scoped-bucket",
        prefix: "tenant-a",
      }),
    ]);

    const expectedPolicy = buildSessionPolicy({
      organization: "org1",
      bucketName: "scoped-bucket",
      prefix: "tenant-a",
      region: "us-east-1",
    });

    expect(AssumeRoleWithWebIdentityCommand).toHaveBeenCalledWith(
      expect.objectContaining({ Policy: expectedPolicy }),
    );
  });

  test("AWS connection with empty prefix: Policy permits whole-bucket scope", async () => {
    await getAllSessionCredentials(mockSessionData, [
      mock.connectionConfig({
        provider: "aws",
        bucketName: "whole-bucket",
        prefix: "",
      }),
    ]);

    const expectedPolicy = buildSessionPolicy({
      organization: "org1",
      bucketName: "whole-bucket",
      prefix: "",
      region: "us-east-1",
    });

    expect(AssumeRoleWithWebIdentityCommand).toHaveBeenCalledWith(
      expect.objectContaining({ Policy: expectedPolicy }),
    );
  });

  test("non-AWS (MinIO) connection: Policy field is absent", async () => {
    await getAllSessionCredentials(mockSessionData, [
      mock.connectionConfig({
        provider: "minio",
        bucketName: "minio-bucket",
        prefix: "some-prefix",
      }),
    ]);

    const call = vi.mocked(AssumeRoleWithWebIdentityCommand).mock.calls[0]?.[0];
    expect(call).toBeDefined();
    expect(call).not.toHaveProperty("Policy");
  });

  test("returns empty credentials when no bucket configs provided", async () => {
    const result = await getAllSessionCredentials(mockSessionData, []);

    expect(result.credentials).toBe(mockSessionData.credentials);
    expect(result.errors).toEqual({});
    expect(mockSend).not.toHaveBeenCalled();
  });
});
