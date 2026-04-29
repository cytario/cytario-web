import { renderHook } from "@testing-library/react";

import { useInitConnections } from "../useInitConnections";
import { ConnectionConfig } from "~/.generated/client";
import mock from "~/utils/__tests__/__mocks__";

const mockSetConnections = vi.fn();

vi.mock("~/utils/connectionsStore/useConnectionsStore", () => ({
  useConnectionsStore: vi.fn((selector) =>
    selector({ setConnections: mockSetConnections }),
  ),
}));

vi.mock("~/utils/connectionsStore/selectors", () => ({
  select: {
    setConnections: (state: { setConnections: unknown }) =>
      state.setConnections,
  },
}));

describe("useInitConnections", () => {
  beforeEach(() => {
    mockSetConnections.mockClear();
  });

  test("calls setConnections with configs and credentials on mount", () => {
    const configs: ConnectionConfig[] = [
      mock.connectionConfig({ name: "conn-1" }),
      mock.connectionConfig({ name: "conn-2" }),
    ];
    const credentials = {
      "conn-1": mock.credentials({ AccessKeyId: "key-1" }),
      "conn-2": mock.credentials({ AccessKeyId: "key-2" }),
    };

    renderHook(() => useInitConnections(configs, credentials));

    expect(mockSetConnections).toHaveBeenCalledTimes(1);
    expect(mockSetConnections).toHaveBeenCalledWith(configs, credentials);
  });

  test("calls setConnections with empty inputs", () => {
    renderHook(() => useInitConnections([], {}));

    expect(mockSetConnections).toHaveBeenCalledTimes(1);
    expect(mockSetConnections).toHaveBeenCalledWith([], {});
  });
});
