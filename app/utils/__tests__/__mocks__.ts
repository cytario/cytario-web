import { Credentials } from "@aws-sdk/client-sts";

import { ConnectionConfig, ConnectionGrant } from "~/.generated/client";
import { UserProfile } from "~/.server/auth/getUserInfo";
import { AuthTokensResponse } from "~/.server/auth/refreshAuthTokens";
import { type CytarioSession, SessionData, SessionFlashData } from "~/.server/auth/sessionStorage";
import { Channel, Image } from "~/components/.client/ImageViewer/state/store/ome.tif.types";
import { TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import type { BucketCatalog, BucketLookupRow } from "~/utils/bucketCatalog.schema";
import type {
  ProviderCatalog,
  ProviderConnection,
  ProviderRole,
} from "~/utils/providerCatalog.schema";

const mock = {
  connectionGrant: (data: Partial<ConnectionGrant> = {}): ConnectionGrant => ({
    id: 0,
    connectionId: 0,
    scope: "org1/lab",
    providerRoleId: "pr-mock",
    ...data,
  }),
  connectionConfig: (
    data: Partial<ConnectionConfig> & { grants?: ConnectionGrant[] } = {},
  ): ConnectionConfig & { grants: ConnectionGrant[] } => ({
    bucketName: "mock-bucket",
    id: 1,
    name: "aws-mock-bucket",
    organization: "org1",
    createdBy: "mock-user-id",
    providerConnectionId: "pc-mock",
    prefix: "",
    bucketPolicyStatus: "none",
    grants: data.grants ?? [mock.connectionGrant()],
    ...(data as Omit<typeof data, "grants">),
  }),
  providerConnection: (data: Partial<ProviderConnection> = {}): ProviderConnection => ({
    id: "pc-mock",
    providerType: "aws",
    endpoint: null,
    region: "us-east-1",
    status: "connected",
    ...data,
  }),
  providerRole: (data: Partial<ProviderRole> = {}): ProviderRole => ({
    id: "pr-mock",
    providerConnectionId: "pc-mock",
    roleArn: "arn:aws:iam::123456789012:role/mock-role",
    name: "mock-role",
    allowedScopes: ["lab"],
    allowsSharing: false,
    ...data,
  }),
  providerCatalog: (data: Partial<ProviderCatalog> = {}): ProviderCatalog => ({
    providerConnections: [mock.providerConnection()],
    providerRoles: [mock.providerRole()],
    ...data,
  }),
  bucketLookupRow: (data: Partial<BucketLookupRow> = {}): BucketLookupRow => ({
    id: "bucket-mock-id",
    providerConnectionId: "pc-mock",
    bucketName: "mock-bucket",
    region: "us-east-1",
    ...data,
  }),
  bucketCatalog: (data: Partial<BucketCatalog> = {}): BucketCatalog => ({
    buckets: [mock.bucketLookupRow()],
    ...data,
  }),
  session: (data: Partial<SessionData & SessionFlashData> = {}): CytarioSession => ({
    id: "session",
    data,
    has: vi.fn(() => false),
    get: vi.fn((key: keyof SessionData & keyof SessionFlashData) => data[key]),
    set: vi.fn(),
    flash: vi.fn(),
    unset: vi.fn(),
  }),
  tokenReponse: (overrides?: Partial<AuthTokensResponse>): AuthTokensResponse => ({
    access_token: "access_token",
    expires_in: 60 * 60, // 1 hour
    refresh_token: "refresh_token",
    refresh_expires_in: 24 * 60 * 60, // 24 hours
    id_token: "id_token",
    token_type: "Bearer",
    scope: "openid profile email",
    ...overrides,
  }),
  credentials: (overrides?: Partial<Credentials>): Credentials => ({
    AccessKeyId: "mockAccessKey",
    SecretAccessKey: "mockSecretKey",
    SessionToken: "mockSessionToken",
    Expiration: new Date(Date.now() + 60 * 60 * 1000),
    ...overrides,
  }),
  user: (overrides?: Partial<UserProfile>): UserProfile => ({
    sub: "mock-user-id",
    email_verified: true,
    name: "string",
    preferred_username: "string",
    given_name: "string",
    family_name: "string",
    email: "string",
    policy: ["default-policy"],
    organization: "org1",
    organizationAttributes: {},
    groups: ["org1/lab"],
    adminScopes: ["org1/lab"],
    ...overrides,
  }),
  treeNode: (overrides?: Partial<TreeNode>): TreeNode => {
    const connectionName = overrides?.connectionName ?? "test-provider-test-bucket";
    const name = overrides?.name ?? "mockName";
    return {
      id: `${connectionName}/${name}`,
      connectionName,
      name,
      type: "directory",
      pathName: name,
      children: [],
      ...overrides,
    };
  },
  channel: (overrides?: Partial<Channel>): Channel => ({
    ID: "mockId",
    SamplesPerPixel: 1,
    Name: "mockName",
    Color: [0, 0, 0, 0],
    ...overrides,
  }),
  pixels: (overrides?: Partial<Image["Pixels"]>): Image["Pixels"] => ({
    ID: "",
    Type: "Int8",
    Channels: [mock.channel()],
    DimensionOrder: "XYZCT",
    SizeX: 1,
    SizeY: 1,
    SizeZ: 1,
    SizeC: 1,
    SizeT: 1,
    PhysicalSizeX: 1,
    PhysicalSizeY: 1,
    PhysicalSizeZ: 0,
    PhysicalSizeXUnit: "nm",
    PhysicalSizeYUnit: "nm",
    PhysicalSizeZUnit: "nm",
    ...overrides,
  }),
  metadata: (overrides?: Partial<Image>): Image => ({
    ID: "string",
    Name: "string",
    AcquisitionDate: "2023-10-01T00:00:00Z",
    Description: "string",
    Pixels: mock.pixels(),
    ...overrides,
  }),

  idToken: (overrides?: Partial<Record<string, string | number>>): string => {
    const header = {
      alg: "HS256",
      typ: "JWT",
    };
    const payload = {
      exp: Math.floor(Date.now() / 1000) + 60 * 60, // 1 hour in the future
      iat: Math.floor(Date.now() / 1000),
      sub: "user-123",
      aud: "client-id",
      ...overrides,
    };

    const encodedHeader = btoa(JSON.stringify(header));
    const encodedPayload = btoa(JSON.stringify(payload));
    const signature = "mock-signature";

    return `${encodedHeader}.${encodedPayload}.${signature}`;
  },
};

export default mock;
