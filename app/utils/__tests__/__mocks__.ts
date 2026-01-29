import { Credentials } from "@aws-sdk/client-sts";

import { BucketConfig } from "~/.generated/client";
import { UserProfile } from "~/.server/auth/getUserInfo";
import { AuthTokensResponse } from "~/.server/auth/refreshAuthTokens";
import {
  type CytarioSession,
  SessionData,
  SessionFlashData,
} from "~/.server/auth/sessionStorage";
import {
  Channel,
  Image,
} from "~/components/.client/ImageViewer/state/ome.tif.types";
import { TreeNode } from "~/components/DirectoryView/buildDirectoryTree";

const mock = {
  bucketConfig: (data: Partial<BucketConfig> = {}): BucketConfig => ({
    name: "mock-bucket",
    id: 0,
    userId: "mock-user-id",
    provider: "aws",
    roleArn: "arn:aws:iam::123456789012:role/mock-role",
    region: "us-east-1",
    endpoint: "https://s3.amazonaws.com",
    ...data,
  }),
  session: (
    data: Partial<SessionData & SessionFlashData> = {},
  ): CytarioSession => ({
    id: "session",
    data,
    has: vi.fn(() => false),
    get: vi.fn((key: keyof SessionData & keyof SessionFlashData) => data[key]),
    set: vi.fn(),
    flash: vi.fn(),
    unset: vi.fn(),
  }),
  tokenReponse: (
    overrides?: Partial<AuthTokensResponse>,
  ): AuthTokensResponse => ({
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
    sub: "string", // uuid
    email_verified: true,
    name: "string",
    preferred_username: "string",
    given_name: "string",
    family_name: "string",
    email: "string",
    policy: "string",
    groups: ["group1", "group2"],
    ...overrides,
  }),
  treeNode: (overrides?: Partial<TreeNode>): TreeNode => ({
    name: "mockName",
    type: "directory",
    bucketName: "test-bucket",
    provider: "test-provider",
    children: [],
    ...overrides,
  }),
  channel: (overrides?: Partial<Channel>): Channel => ({
    ID: "mockId",
    SamplesPerPixel: 1,
    Name: "mockName",
    Color: [0, 0, 0, 0],
    ...overrides,
  }),
  pixels: (overrides?: Partial<Image["Pixels"]>): Image["Pixels"] => ({
    ID: "",
    Type: "int8",
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
    AquisitionDate: "2023-10-01T00:00:00Z",
    Description: "string",
    Pixels: mock.pixels(),
    format: () => ({
      "Acquisition Date": "2023-10-01T00:00:00Z",
      "Dimensions (XY)": "1 x 1",
      "Pixels Type": "uint32",
      "Pixels Size (XYZ)": "1 x 1 x 0 µm",
      "Z-sections/Timepoints": "1",
      Channels: 12,
    }),
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
