import { render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";

import { TreeNode } from "../buildDirectoryTree";
import { DirectoryViewTableConnection } from "../DirectoryViewTableConnection";

// Mock the connections store
vi.mock("~/utils/connectionsStore", () => ({
  useConnectionsStore: vi.fn((selector) => {
    const connections: Record<string, { connectionConfig: Record<string, unknown> }> = {
      "aws-my-aws-bucket": {
        connectionConfig: {
          bucketName: "my-aws-bucket",
          provider: "aws",
          endpoint: "",
          region: "eu-central-1",
          roleArn: "arn:aws:iam::123456789:role/S3AccessRole",
          ownerScope: "cytario",
          createdBy: "admin@cytario.com",
        },
      },
      "minio-minio-bucket": {
        connectionConfig: {
          bucketName: "minio-bucket",
          provider: "minio",
          endpoint: "https://s3.cytar.io",
          region: null,
          roleArn: null,
          ownerScope: "cytario/lab",
          createdBy: "lab@cytario.com",
        },
      },
    };
    return selector({ connections });
  }),
}));

describe("DirectoryViewTableConnection", () => {
  const mockBucketNodes: TreeNode[] = [
    {
      id: "aws-my-aws-bucket",
      connectionName: "aws-my-aws-bucket",
      type: "bucket",
      name: "my-aws-bucket",
      pathName: "",
      children: [],
    },
    {
      id: "minio-minio-bucket",
      connectionName: "minio-minio-bucket",
      type: "bucket",
      name: "minio-bucket",
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

    // Check bucket names
    expect(screen.getByText("my-aws-bucket")).toBeInTheDocument();
    expect(screen.getByText("minio-bucket")).toBeInTheDocument();

    // Provider and region values appear in body cells (inside aria-hidden table)
    const body = document.body.textContent ?? "";
    expect(body).toContain("aws");
    expect(body).toContain("minio");
    expect(body).toContain("eu-central-1");
  });
});
