import { act, renderHook } from "@testing-library/react";
import { useRevalidator } from "react-router";

import { useCredentialsKeepAlive } from "../useCredentialsKeepAlive";
import mock from "~/utils/__tests__/__mocks__";
import { useConnectionsStore } from "~/utils/connectionsStore/useConnectionsStore";
import { __resetCredentialsRefresher, requestCredentialsRefresh } from "~/utils/credentialsRefresh";

vi.mock("react-router", () => ({
  useRevalidator: vi.fn(() => ({ revalidate: vi.fn(async () => {}) })),
}));

const seedConnection = (connectionId: string, isPublic: boolean) => {
  useConnectionsStore.setState({
    connections: {
      [connectionId]: {
        connectionConfig: mock.connectionConfig() as never,
        credentials: isPublic ? null : mock.credentials(),
        provider: {
          region: "eu-central-1",
          endpoint: null,
          allowsSharing: false,
          accessLevel: "read-only",
          isPublic,
        },
        status: "connected",
      },
    },
  });
};

describe("useCredentialsKeepAlive refresher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useRevalidator).mockReturnValue({ revalidate: vi.fn(async () => {}) } as never);
    useConnectionsStore.setState({ connections: {} });
    __resetCredentialsRefresher();
  });

  afterEach(() => {
    __resetCredentialsRefresher();
  });

  test("the installed refresher fails loudly for a public connection instead of minting", async () => {
    seedConnection("public-conn", true);
    renderHook(() => useCredentialsKeepAlive());

    const error = await requestCredentialsRefresh("public-conn").catch((e: unknown) => e);
    // The refresher's rejection is wrapped; the cause carries the reason.
    const cause = (error as { cause?: unknown }).cause;
    expect(String(cause)).toMatch(/public \(credential-less\)/i);
  });

  test(
    "the installed refresher resolves for a credentialed connection",
    { timeout: 10_000 },
    async () => {
      seedConnection("private-conn", false);
      const { unmount } = renderHook(() => useCredentialsKeepAlive());

      await act(async () => {
        const credentials = await requestCredentialsRefresh("private-conn");
        expect(credentials.AccessKeyId).toBeDefined();
      });
      unmount();
    },
  );
});
