import { GetBucketPolicyCommand, PutBucketPolicyCommand, S3Client } from "@aws-sdk/client-s3";
import { AssumeRoleWithWebIdentityCommand, STSClient } from "@aws-sdk/client-sts";

import { isManagedStatement, type BucketPolicyGrant } from "../bucketPolicy";
import {
  type ApplyTarget,
  accountIdFromRoleArn,
  applyBucketPolicy,
} from "../bucketPolicyApply.server";

vi.mock("@aws-sdk/client-sts", () => ({
  STSClient: vi.fn(),
  AssumeRoleWithWebIdentityCommand: vi.fn((input) => ({ __type: "AssumeRole", input })),
}));

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: vi.fn(),
  GetBucketPolicyCommand: vi.fn((input) => ({ __type: "GetBucketPolicy", input })),
  PutBucketPolicyCommand: vi.fn((input) => ({ __type: "PutBucketPolicy", input })),
}));

vi.mock("~/utils/s3Provider", () => ({
  getS3ProviderConfig: vi.fn(() => ({
    stsEndpoint: "https://sts.eu-central-1.amazonaws.com",
    s3Endpoint: "https://s3.eu-central-1.amazonaws.com",
    usePathStyle: false,
    isAwsS3: true,
  })),
}));

// Run the locked body immediately; the lock itself is unit-tested separately.
vi.mock("../bucketPolicyLock", () => ({
  withBucketPolicyLock: vi.fn(
    async (_accountId: string, _bucket: string, fn: () => Promise<unknown>) => fn(),
  ),
}));

const WRITE_CREDS = {
  AccessKeyId: "ASIA_WRITE_SESSION_KEY",
  SecretAccessKey: "WRITE_SESSION_SECRET_XYZ",
  SessionToken: "WRITE_SESSION_TOKEN_ABC",
  Expiration: new Date(Date.now() + 900_000),
};

const ORG = "vericura";
const target: ApplyTarget = {
  organization: ORG,
  bucketName: "customer-bucket",
  region: "eu-central-1",
  endpoint: null,
  roleArn: "arn:aws:iam::123456789012:role/cytario/provider-roles/lab-rw",
};

const grant = (overrides: Partial<BucketPolicyGrant> = {}): BucketPolicyGrant => ({
  organization: ORG,
  bucketName: "customer-bucket",
  groupPath: "Lab/TeamX",
  prefix: "projects/alpha",
  accessLevel: "read-only",
  ...overrides,
});

const stsSend = vi.fn();
const s3Send = vi.fn();

/** Recursively search a value for any of the given secret strings. */
const containsSecret = (value: unknown, secrets: string[]): boolean => {
  const serialized = JSON.stringify(value);
  return secrets.some((s) => serialized.includes(s));
};

beforeEach(() => {
  vi.clearAllMocks();

  vi.mocked(STSClient).mockImplementation(() => ({ send: stsSend }) as unknown as STSClient);
  vi.mocked(S3Client).mockImplementation(() => ({ send: s3Send }) as unknown as S3Client);

  stsSend.mockResolvedValue({ Credentials: WRITE_CREDS });
  // default: bucket has no policy yet
  s3Send.mockImplementation(async (command: { __type: string }) => {
    if (command.__type === "GetBucketPolicy") {
      const err = Object.assign(new Error("no policy"), { name: "NoSuchBucketPolicy" });
      throw err;
    }
    if (command.__type === "PutBucketPolicy") return {};
    return {};
  });
});

describe("accountIdFromRoleArn", () => {
  test("extracts the 12-digit account id", () => {
    expect(accountIdFromRoleArn("arn:aws:iam::123456789012:role/x")).toBe("123456789012");
  });

  test("throws (fails closed) on a malformed ARN", () => {
    expect(() => accountIdFromRoleArn("not-an-arn")).toThrow();
  });
});

describe("applyBucketPolicy — happy path", () => {
  test("mints a write session, reads then writes the bucket policy", async () => {
    const result = await applyBucketPolicy(target, [grant()], "id-token", "Alice Admin");

    expect(result.status).toBe("applied");

    // write session minted with the write-session inline Policy (permits PutBucketPolicy)
    expect(AssumeRoleWithWebIdentityCommand).toHaveBeenCalledTimes(1);
    const assumeInput = vi.mocked(AssumeRoleWithWebIdentityCommand).mock.calls[0][0];
    expect(assumeInput.RoleArn).toBe(target.roleArn);
    expect(assumeInput.Policy).toContain("s3:PutBucketPolicy");
    expect(assumeInput.Policy).toContain("aws:PrincipalTag/ORG");

    // read-merge-write ordering
    expect(GetBucketPolicyCommand).toHaveBeenCalledWith({ Bucket: "customer-bucket" });
    expect(PutBucketPolicyCommand).toHaveBeenCalledTimes(1);
  });

  test("SECURITY: the write-session credentials never appear in the returned result", async () => {
    const result = await applyBucketPolicy(target, [grant()], "id-token", "Alice Admin");

    expect(
      containsSecret(result, [
        WRITE_CREDS.AccessKeyId,
        WRITE_CREDS.SecretAccessKey,
        WRITE_CREDS.SessionToken,
      ]),
    ).toBe(false);
  });

  test("the applied policy carries the managed statements, ORG- and group-conditioned", async () => {
    await applyBucketPolicy(target, [grant()], "id-token", "Alice Admin");

    const putInput = vi.mocked(PutBucketPolicyCommand).mock.calls[0][0];
    const applied = JSON.parse(putInput.Policy as string);
    const managed = applied.Statement.filter(isManagedStatement);
    expect(managed.length).toBeGreaterThan(0);
    for (const stmt of managed) {
      expect(stmt.Condition.StringEquals["aws:PrincipalTag/ORG"]).toBe(ORG);
      expect(stmt.Condition.StringEquals["aws:PrincipalTag/Lab/TeamX"]).toBe("1");
    }
  });

  test("PRESERVES foreign statements on read-merge-write", async () => {
    const foreign = {
      Sid: "CustomerBaseline",
      Effect: "Allow",
      Action: "s3:GetObject",
      Resource: "arn:aws:s3:::customer-bucket/legacy/*",
    };
    s3Send.mockImplementation(async (command: { __type: string }) => {
      if (command.__type === "GetBucketPolicy") {
        return { Policy: JSON.stringify({ Version: "2012-10-17", Statement: [foreign] }) };
      }
      return {};
    });

    await applyBucketPolicy(target, [grant()], "id-token", "Alice Admin");

    const putInput = vi.mocked(PutBucketPolicyCommand).mock.calls[0][0];
    const applied = JSON.parse(putInput.Policy as string);
    expect(applied.Statement).toContainEqual(foreign);
  });

  test("idempotent: re-applying the same grant set writes the same policy document", async () => {
    await applyBucketPolicy(target, [grant()], "id-token", "Alice Admin");
    const first = vi.mocked(PutBucketPolicyCommand).mock.calls[0][0].Policy;

    // second run: bucket now already has the managed statements
    s3Send.mockImplementation(async (command: { __type: string }) => {
      if (command.__type === "GetBucketPolicy") return { Policy: first };
      return {};
    });

    await applyBucketPolicy(target, [grant()], "id-token", "Alice Admin");
    const second = vi.mocked(PutBucketPolicyCommand).mock.calls[1][0].Policy;
    expect(second).toBe(first);
  });
});

describe("applyBucketPolicy — fail-safe on missing privilege", () => {
  test("AccessDenied on PutBucketPolicy → warning, never 'applied'", async () => {
    s3Send.mockImplementation(async (command: { __type: string }) => {
      if (command.__type === "GetBucketPolicy") {
        const err = Object.assign(new Error("no policy"), { name: "NoSuchBucketPolicy" });
        throw err;
      }
      if (command.__type === "PutBucketPolicy") {
        throw Object.assign(new Error("denied"), { name: "AccessDenied" });
      }
      return {};
    });

    const result = await applyBucketPolicy(target, [grant()], "id-token", "Alice Admin");

    expect(result.status).toBe("warning");
    expect(result.warning).toMatch(/PutBucketPolicy was denied|governed solely/i);
  });

  test("AccessDenied warning result still leaks no credentials", async () => {
    s3Send.mockImplementation(async (command: { __type: string }) => {
      if (command.__type === "GetBucketPolicy") {
        throw Object.assign(new Error("no policy"), { name: "NoSuchBucketPolicy" });
      }
      throw Object.assign(new Error("denied"), { name: "AccessDenied" });
    });

    const result = await applyBucketPolicy(target, [grant()], "id-token", "Alice Admin");
    expect(containsSecret(result, [WRITE_CREDS.SecretAccessKey, WRITE_CREDS.SessionToken])).toBe(
      false,
    );
  });
});

describe("applyBucketPolicy — all-or-nothing", () => {
  test("a generation fault (grant missing ORG) fails closed before any AWS call", async () => {
    await expect(
      applyBucketPolicy(target, [grant({ organization: "" })], "id-token", "Alice Admin"),
    ).rejects.toThrow(/organization/i);

    expect(AssumeRoleWithWebIdentityCommand).not.toHaveBeenCalled();
    expect(PutBucketPolicyCommand).not.toHaveBeenCalled();
  });

  test("a malformed live policy fails closed with no PutBucketPolicy", async () => {
    s3Send.mockImplementation(async (command: { __type: string }) => {
      if (command.__type === "GetBucketPolicy") return { Policy: "{not-json" };
      return {};
    });

    await expect(applyBucketPolicy(target, [grant()], "id-token", "Alice Admin")).rejects.toThrow(
      /valid JSON/i,
    );
    expect(PutBucketPolicyCommand).not.toHaveBeenCalled();
  });
});
