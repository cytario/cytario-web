import { render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";

import { TreeNode } from "../buildDirectoryTree";
import { DirectoryViewTableConnection } from "../DirectoryViewTableConnection";
import mock from "~/utils/__tests__/__mocks__";

vi.mock("~/routes/favorites/useFavorite", () => ({
  useFavorite: () => ({ isFavorite: false, isPending: false, toggle: vi.fn() }),
}));

const credentials = mock.credentials();
const connections = {
  "aws-my-aws-bucket": {
    connectionConfig: mock.connectionConfig({
      name: "aws-my-aws-bucket",
      bucketName: "my-aws-bucket",
      grants: [mock.connectionGrant({ scope: "cytario" })],
      bucketPolicyStatus: "applied",
      createdBy: "admin@cytario.com",
    }),
    credentials,
  },
  "second-bucket": {
    connectionConfig: mock.connectionConfig({
      name: "second-bucket",
      bucketName: "other-bucket",
      grants: [mock.connectionGrant({ scope: "cytario/lab" })],
      bucketPolicyStatus: "drifted",
      createdBy: "lab@cytario.com",
    }),
    credentials,
  },
};

vi.mock("~/utils/connectionsStore/useConnectionsStore", () => ({
  useConnectionsStore: vi.fn((selector) => selector({ connections })),
}));

vi.mock("~/utils/connectionsStore/selectors", () => ({
  select: {
    connections: (state: { connections: unknown }) => state.connections,
    connection: (name: string) => (state: { connections: Record<string, unknown> }) =>
      state.connections[name],
    connectionConfig:
      (name: string) => (state: { connections: Record<string, { connectionConfig: unknown }> }) =>
        state.connections[name]?.connectionConfig,
    connectionStatus:
      (name: string) => (state: { connections: Record<string, { status?: string }> }) =>
        state.connections[name]?.status ?? "loading",
    connectionStatusMessage:
      (name: string) => (state: { connections: Record<string, { statusMessage?: string }> }) =>
        state.connections[name]?.statusMessage,
  },
}));

describe("DirectoryViewTableConnection", () => {
  const mockBucketNodes: TreeNode[] = [
    {
      id: "aws-my-aws-bucket/",
      connectionId: "aws-my-aws-bucket",
      connectionName: "aws-my-aws-bucket",
      type: "bucket",
      name: "aws-my-aws-bucket",
      pathName: "",
      children: [],
    },
    {
      id: "second-bucket/",
      connectionId: "second-bucket",
      connectionName: "second-bucket",
      type: "bucket",
      name: "second-bucket",
      pathName: "",
      children: [],
    },
  ];

  test("renders bucket columns: Name, Bucket, Policy visible; Prefix, Created By hidden", () => {
    const RemixStub = createRoutesStub([
      {
        path: "/",
        Component: () => <DirectoryViewTableConnection nodes={mockBucketNodes} />,
      },
    ]);

    render(<RemixStub initialEntries={["/"]} />);

    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Bucket")).toBeInTheDocument();
    expect(screen.getByText("Policy")).toBeInTheDocument();
    // Prefix and Created By are hidden by default; provider/role/endpoint columns
    // are gone with the new model.
    expect(screen.queryByText("Prefix")).not.toBeInTheDocument();
    expect(screen.queryByText("Created By")).not.toBeInTheDocument();
    expect(screen.queryByText("RoleARN")).not.toBeInTheDocument();
  });

  test("renders bucket rows with policy-status labels", () => {
    const RemixStub = createRoutesStub([
      {
        path: "/",
        Component: () => <DirectoryViewTableConnection nodes={mockBucketNodes} />,
      },
    ]);

    render(<RemixStub initialEntries={["/"]} />);

    expect(screen.getByText("aws-my-aws-bucket")).toBeInTheDocument();
    expect(screen.getByText("second-bucket")).toBeInTheDocument();

    const body = document.body.textContent ?? "";
    expect(body).toContain("Applied");
    expect(body).toContain("Drifted");
  });
});
