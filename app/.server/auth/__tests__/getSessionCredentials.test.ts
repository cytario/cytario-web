import {
  AssumeRoleWithWebIdentityCommand,
  STSClient,
} from "@aws-sdk/client-sts";

import {
  getAllSessionCredentials,
  isValidCredentials,
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

describe("getAllSessionCredentials", () => {
  const mockSend = vi.fn();
  const mockCredentials = mock.credentials();

  const mockSessionData: SessionData = {
    user: mock.user({ sub: "user-123" }),
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
      "bucket-a": mock.credentials(),
    };
    const sessionData = {
      ...mockSessionData,
      credentials: validCredentials,
    };

    const result = await getAllSessionCredentials(sessionData, [
      mock.bucketConfig({ name: "bucket-a" }),
    ]);

    expect(result).toBe(validCredentials);
    expect(mockSend).not.toHaveBeenCalled();
  });

  test("fetches credentials for buckets with missing credentials", async () => {
    const result = await getAllSessionCredentials(mockSessionData, [
      mock.bucketConfig({ name: "new-bucket" }),
    ]);

    expect(result).toEqual({ "new-bucket": mockCredentials });
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  test("fetches credentials for buckets with expired credentials", async () => {
    const sessionData = {
      ...mockSessionData,
      credentials: {
        "expired-bucket": mock.credentials({
          Expiration: new Date(Date.now() - 60 * 1000),
        }),
      },
    };

    const result = await getAllSessionCredentials(sessionData, [
      mock.bucketConfig({ name: "expired-bucket" }),
    ]);

    expect(result).toEqual({ "expired-bucket": mockCredentials });
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  test("deduplicates by bucket name (multiple prefix configs)", async () => {
    const configs = [
      mock.bucketConfig({ name: "shared-bucket", prefix: "" }),
      mock.bucketConfig({ name: "shared-bucket", prefix: "data/images" }),
      mock.bucketConfig({ name: "shared-bucket", prefix: "data/tiles" }),
    ];

    await getAllSessionCredentials(mockSessionData, configs);

    // Only one STS call despite three configs for the same bucket
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  test("fetches multiple buckets in parallel", async () => {
    const configs = [
      mock.bucketConfig({ name: "bucket-a" }),
      mock.bucketConfig({ name: "bucket-b" }),
    ];

    const result = await getAllSessionCredentials(mockSessionData, configs);

    expect(mockSend).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      "bucket-a": mockCredentials,
      "bucket-b": mockCredentials,
    });
  });

  test("preserves existing valid credentials when fetching new ones", async () => {
    const existingCredentials = mock.credentials();
    const sessionData = {
      ...mockSessionData,
      credentials: { "existing-bucket": existingCredentials },
    };

    const result = await getAllSessionCredentials(sessionData, [
      mock.bucketConfig({ name: "existing-bucket" }),
      mock.bucketConfig({ name: "new-bucket" }),
    ]);

    expect(result["existing-bucket"]).toBe(existingCredentials);
    expect(result["new-bucket"]).toEqual(mockCredentials);
    // Only fetched for new-bucket, not existing-bucket
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  test("handles partial failures gracefully", async () => {
    mockSend
      .mockResolvedValueOnce({ Credentials: mockCredentials })
      .mockRejectedValueOnce(new Error("STS service unavailable"));

    const configs = [
      mock.bucketConfig({ name: "bucket-a" }),
      mock.bucketConfig({ name: "bucket-b" }),
    ];

    const result = await getAllSessionCredentials(mockSessionData, configs);

    // bucket-a succeeds, bucket-b fails silently
    expect(result["bucket-a"]).toEqual(mockCredentials);
    expect(result["bucket-b"]).toBeUndefined();
  });

  test("calls STS with correct configuration", async () => {
    await getAllSessionCredentials(mockSessionData, [
      mock.bucketConfig({
        name: "test-bucket",
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
      RoleSessionName: "test-web-identity-session",
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
