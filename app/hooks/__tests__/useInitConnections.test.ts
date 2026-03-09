import { renderHook } from "@testing-library/react";

import { useInitConnections } from "../useInitConnections";
import { ConnectionConfig } from "~/.generated/client";
import mock from "~/utils/__tests__/__mocks__";

const mockSetConnection = vi.fn();
const mockProbeIndex = vi.fn();

vi.mock("~/utils/connectionsStore", () => ({
  useConnectionsStore: vi.fn((selector) =>
    selector({ setConnection: mockSetConnection }),
  ),
  select: {
    setConnection: (state: { setConnection: unknown }) => state.setConnection,
  },
}));

vi.mock("~/utils/connectionIndex", () => ({
  probeIndex: (...args: unknown[]) => mockProbeIndex(...args),
}));

describe("useInitConnections", () => {
  beforeEach(() => {
    mockSetConnection.mockClear();
    mockProbeIndex.mockClear();
  });

  test("calls setConnection for each config with matching credentials", () => {
    const configs: ConnectionConfig[] = [
      mock.connectionConfig({ alias: "conn-1", name: "bucket-1" }),
      mock.connectionConfig({ alias: "conn-2", name: "bucket-2" }),
    ];

    const creds1 = mock.credentials({ AccessKeyId: "key-1" });
    const creds2 = mock.credentials({ AccessKeyId: "key-2" });

    const credentials = {
      "bucket-1": creds1,
      "bucket-2": creds2,
    };

    renderHook(() => useInitConnections(configs, credentials));

    expect(mockSetConnection).toHaveBeenCalledTimes(2);
    expect(mockSetConnection).toHaveBeenCalledWith("conn-1", creds1, configs[0]);
    expect(mockSetConnection).toHaveBeenCalledWith("conn-2", creds2, configs[1]);
  });

  test("skips configs without matching credentials", () => {
    const configs: ConnectionConfig[] = [
      mock.connectionConfig({ alias: "conn-1", name: "bucket-1" }),
      mock.connectionConfig({ alias: "conn-2", name: "bucket-2" }),
    ];

    const credentials = {
      "bucket-1": mock.credentials(),
      // bucket-2 has no credentials
    };

    renderHook(() => useInitConnections(configs, credentials));

    expect(mockSetConnection).toHaveBeenCalledTimes(1);
    expect(mockSetConnection).toHaveBeenCalledWith(
      "conn-1",
      expect.objectContaining({ AccessKeyId: "mockAccessKey" }),
      configs[0],
    );
  });

  test("does nothing with empty configs", () => {
    renderHook(() => useInitConnections([], {}));

    expect(mockSetConnection).not.toHaveBeenCalled();
  });
});
