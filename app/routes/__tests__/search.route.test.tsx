import { S3Client } from "@aws-sdk/client-s3";
import { createContext } from "react-router";
import { describe, expect, test, vi } from "vitest";

import { type SessionData } from "~/.server/auth/sessionStorage";
import { loader, handle } from "~/routes/search.route";
import mock from "~/utils/__tests__/__mocks__";

vi.mock("~/.server/auth/authMiddleware", () => ({
  authContext: createContext<Partial<SessionData>>(),
  authMiddleware: vi.fn(async (_ctx, next) => next()),
}));

vi.mock("~/.server/auth/getS3Client", () => ({
  getS3Client: vi.fn(),
}));

vi.mock("~/utils/getObjects", () => ({
  getObjects: vi.fn(),
}));

const { authContext } = await import("~/.server/auth/authMiddleware");
const { getS3Client } = await import("~/.server/auth/getS3Client");
const { getObjects } = await import("~/utils/getObjects");

describe("SearchRoute", () => {
  test("loader should propagate errors from getGlobalSearch", async () => {
    // Setup mocks with return values
    vi.mocked(getS3Client).mockResolvedValue({} as S3Client);
    vi.mocked(getObjects).mockRejectedValue(
      new Error("Search service unavailable")
    );

    const request = new Request("http://localhost/search?query=test");

    // Mock the context.get(authContext) call
    const mockContext = {
      get: vi.fn((ctx) => {
        if (ctx === authContext) {
          return {
            user: mock.user(),
            authTokens: {
              idToken: mock.idToken(),
              accessToken: "mock-access-token",
              refreshToken: "mock-refresh-token",
            },
            credentials: {
              "mock-bucket": mock.credentials(),
            },
            bucketConfigs: [mock.bucketConfig()],
          };
        }
        return undefined;
      }),
    };

    await expect(
      loader({
        request,
        params: {},
        context: mockContext as never,
        unstable_pattern: "",
      })
    ).rejects.toThrow("Search service unavailable");
  });

  test("handle should return correct breadcrumb", () => {
    const breadcrumb = handle.breadcrumb();

    expect(breadcrumb.key).toBe("search");
    expect(breadcrumb.props.to).toBe("/search");
    expect(breadcrumb.props.children).toBe("Search");
  });
});
