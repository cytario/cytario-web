import {
  AssumeRoleWithWebIdentityCommand,
  STSClient,
} from "@aws-sdk/client-sts";

import { getSessionCredentials } from "../getSessionCredentials";
import type { SessionData } from "../sessionStorage";
import mock from "~/utils/__tests__/__mocks__";
import { getBucketConfigByPath } from "~/utils/bucketConfig";

vi.mock("@aws-sdk/client-sts", () => ({
  STSClient: vi.fn(),
  AssumeRoleWithWebIdentityCommand: vi.fn(),
}));

vi.mock("~/utils/bucketConfig", () => ({
  getBucketConfigByPath: vi.fn(),
}));

vi.mock("~/utils/s3Provider", () => ({
  getS3ProviderConfig: vi.fn(() => ({
    stsEndpoint: "https://sts.us-east-1.amazonaws.com",
  })),
}));

describe("getSessionCredentials", () => {
  const mockSend = vi.fn();
  const mockCredentials = mock.credentials();

  const mockSessionData: SessionData = {
    user: mock.user({ sub: "user-123" }),
    authTokens: {
      accessToken: "access-token",
      idToken: "id-token-for-sts",
      refreshToken: "refresh-token",
    },
    credentials: {
      "existing-bucket": mockCredentials,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup STS client mock
    vi.mocked(STSClient).mockImplementation(
      () =>
        ({
          send: mockSend,
        }) as unknown as STSClient
    );

    mockSend.mockResolvedValue({
      Credentials: mockCredentials,
    });

    vi.mocked(getBucketConfigByPath).mockResolvedValue(
      mock.bucketConfig({
        name: "test-bucket",
        roleArn: "arn:aws:iam::123456789012:role/test-role",
        region: "us-west-2",
        endpoint: "https://s3.us-west-2.amazonaws.com",
      })
    );
  });

  describe("when no provider/bucketName provided", () => {
    test("returns existing session credentials", async () => {
      const result = await getSessionCredentials(mockSessionData);

      expect(result).toBe(mockSessionData.credentials);
      expect(getBucketConfigByPath).not.toHaveBeenCalled();
      expect(mockSend).not.toHaveBeenCalled();
    });

    test("returns existing credentials when provider is undefined", async () => {
      const result = await getSessionCredentials(
        mockSessionData,
        undefined,
        "some-bucket"
      );

      expect(result).toBe(mockSessionData.credentials);
    });

    test("returns existing credentials when bucketName is undefined", async () => {
      const result = await getSessionCredentials(
        mockSessionData,
        "aws",
        undefined
      );

      expect(result).toBe(mockSessionData.credentials);
    });
  });

  describe("when provider and bucketName provided", () => {
    test("fetches bucket config by name", async () => {
      await getSessionCredentials(mockSessionData, "aws", "new-bucket");

      expect(getBucketConfigByPath).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: "user-123",
          groups: ["org1/lab", "org1/lab/admins"],
        }),
        "aws",
        "new-bucket",
        ""
      );
    });

    test("calls STS AssumeRoleWithWebIdentity", async () => {
      await getSessionCredentials(mockSessionData, "aws", "new-bucket");

      expect(AssumeRoleWithWebIdentityCommand).toHaveBeenCalledWith({
        RoleArn: "arn:aws:iam::123456789012:role/test-role",
        RoleSessionName: "test-web-identity-session",
        WebIdentityToken: "id-token-for-sts",
        DurationSeconds: 3600, // 1 hour
      });

      expect(mockSend).toHaveBeenCalled();
    });

    test("returns merged credentials with new bucket credentials", async () => {
      const result = await getSessionCredentials(
        mockSessionData,
        "aws",
        "new-bucket"
      );

      expect(result).toEqual({
        ...mockSessionData.credentials,
        "new-bucket": mockCredentials,
      });
    });

    test("uses correct STS client configuration", async () => {
      await getSessionCredentials(mockSessionData, "aws", "new-bucket");

      expect(STSClient).toHaveBeenCalledWith({
        endpoint: "https://sts.us-east-1.amazonaws.com",
        region: "us-west-2",
      });
    });
  });

  describe("error handling", () => {
    test("throws when bucket config not found", async () => {
      vi.mocked(getBucketConfigByPath).mockResolvedValue(null);

      await expect(
        getSessionCredentials(mockSessionData, "aws", "unknown-bucket")
      ).rejects.toThrow(
        "Bucket config not found for bucket: aws/unknown-bucket/"
      );
    });

    test("throws when STS returns no credentials", async () => {
      mockSend.mockResolvedValue({
        Credentials: undefined,
      });

      await expect(
        getSessionCredentials(mockSessionData, "aws", "test-bucket")
      ).rejects.toThrow("No credentials returned from STS");
    });

    test("throws on STS error", async () => {
      mockSend.mockRejectedValue(new Error("STS service unavailable"));

      await expect(
        getSessionCredentials(mockSessionData, "aws", "test-bucket")
      ).rejects.toThrow("STS service unavailable");
    });
  });

  describe("region handling", () => {
    test("uses default region when bucket config has no region", async () => {
      vi.mocked(getBucketConfigByPath).mockResolvedValue(
        mock.bucketConfig({
          name: "regionless-bucket",
          region: null,
        })
      );

      await getSessionCredentials(mockSessionData, "aws", "regionless-bucket");

      expect(STSClient).toHaveBeenCalledWith(
        expect.objectContaining({
          region: "eu-central-1",
        })
      );
    });

    test("handles undefined roleArn", async () => {
      vi.mocked(getBucketConfigByPath).mockResolvedValue(
        mock.bucketConfig({
          name: "no-role-bucket",
          roleArn: null,
        })
      );

      await getSessionCredentials(mockSessionData, "aws", "no-role-bucket");

      expect(AssumeRoleWithWebIdentityCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          RoleArn: undefined,
        })
      );
    });
  });
});
