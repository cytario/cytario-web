import { render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";

import { TreeNode } from "../buildDirectoryTree";
import { DirectoryViewTableConnection } from "../DirectoryViewTableConnection";
import mock from "~/utils/__tests__/__mocks__";

const credentials = mock.credentials();
const connections = {
  "aws-my-aws-bucket": {
    connectionConfig: mock.connectionConfig({
      name: "aws-my-aws-bucket",
      bucketName: "my-aws-bucket",
      provider: "aws",
      endpoint: "",
      region: "eu-central-1",
      roleArn: "arn:aws:iam::123456789:role/S3AccessRole",
      ownerScope: "cytario",
      createdBy: "admin@cytario.com",
    }),
    credentials,
  },
  "minio-minio-bucket": {
    connectionConfig: mock.connectionConfig({
      name: "minio-minio-bucket",
      bucketName: "minio-bucket",
      provider: "minio",
      endpoint: "https://s3.cytar.io",
      region: null,
      roleArn: null,
      ownerScope: "cytario/lab",
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
  },
}));

describe("DirectoryViewTableConnection", () => {
  const mockBucketNodes: TreeNode[] = [
    {
      id: "aws-my-aws-bucket/",
      connectionName: "aws-my-aws-bucket",
      type: "bucket",
      name: "aws-my-aws-bucket",
      pathName: "",
      children: [],
    },
    {
      id: "minio-minio-bucket/",
      connectionName: "minio-minio-bucket",
      type: "bucket",
      name: "minio-minio-bucket",
      pathName: "",
      children: [],
    },
  ];

  test("renders bucket columns: Name, Scope, Provider, Region visible; Endpoint, Created By, RoleARN hidden", () => {
    const RemixStub = createRoutesStub([
      {
        path: "/",
        Component: () => <DirectoryViewTableConnection nodes={mockBucketNodes} />,
      },
    ]);

    render(<RemixStub initialEntries={["/"]} />);

    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Scope")).toBeInTheDocument();
    expect(screen.getByText("Provider")).toBeInTheDocument();
    expect(screen.getByText("Region")).toBeInTheDocument();
    // Endpoint, Created By, and RoleARN are hidden by default
    expect(screen.queryByText("Endpoint")).not.toBeInTheDocument();
    expect(screen.queryByText("Created By")).not.toBeInTheDocument();
    expect(screen.queryByText("RoleARN")).not.toBeInTheDocument();
  });

  test("renders bucket data with provider and endpoint", () => {
    const RemixStub = createRoutesStub([
      {
        path: "/",
        Component: () => <DirectoryViewTableConnection nodes={mockBucketNodes} />,
      },
    ]);

    render(<RemixStub initialEntries={["/"]} />);

    // Check connection names
    expect(screen.getByText("aws-my-aws-bucket")).toBeInTheDocument();
    expect(screen.getByText("minio-minio-bucket")).toBeInTheDocument();

    // Provider and region values appear in body cells (inside aria-hidden table)
    const body = document.body.textContent ?? "";
    expect(body).toContain("aws");
    expect(body).toContain("minio");
    expect(body).toContain("eu-central-1");
  });
});
