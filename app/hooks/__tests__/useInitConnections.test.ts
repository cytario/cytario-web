import { renderHook } from "@testing-library/react";

import { useInitConnections } from "../useInitConnections";
import { ConnectionConfig } from "~/.generated/client";
import mock from "~/utils/__tests__/__mocks__";

const mockReconcile = vi.fn();

vi.mock("~/utils/connectionsStore/useConnectionsStore", () => ({
  useConnectionsStore: vi.fn((selector) =>
    selector({ reconcileConnections: mockReconcile }),
  ),
}));

vi.mock("~/utils/connectionsStore/selectors", () => ({
  select: {
    reconcileConnections: (state: { reconcileConnections: unknown }) =>
      state.reconcileConnections,
  },
}));

describe("useInitConnections", () => {
  beforeEach(() => {
    mockReconcile.mockClear();
  });

  test("reconciles configs and credentials on mount", () => {
    const configs: ConnectionConfig[] = [
      mock.connectionConfig({ name: "conn-1", bucketName: "bucket-1" }),
      mock.connectionConfig({ name: "conn-2", bucketName: "bucket-2" }),
    ];
    const credentials = {
      "bucket-1": mock.credentials({ AccessKeyId: "key-1" }),
      "bucket-2": mock.credentials({ AccessKeyId: "key-2" }),
    };

    renderHook(() => useInitConnections(configs, credentials));

    expect(mockReconcile).toHaveBeenCalledTimes(1);
    expect(mockReconcile).toHaveBeenCalledWith(configs, credentials);
  });

  test("reconciles with empty inputs", () => {
    renderHook(() => useInitConnections([], {}));

    expect(mockReconcile).toHaveBeenCalledTimes(1);
    expect(mockReconcile).toHaveBeenCalledWith([], {});
  });
});
