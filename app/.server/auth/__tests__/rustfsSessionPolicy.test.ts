import { buildRustfsSessionPolicy } from "../rustfsSessionPolicy";

interface PolicyStatement {
  Sid: string;
  Effect: "Allow" | "Deny";
  Action: string;
  Resource: string | string[];
  Condition?: {
    StringLike?: {
      "s3:prefix"?: string[];
    };
  };
}

interface ParsedPolicy {
  Version: string;
  Statement: PolicyStatement[];
}

const parse = (json: string): ParsedPolicy => JSON.parse(json) as ParsedPolicy;

const findStatement = (policy: ParsedPolicy, action: string): PolicyStatement => {
  const stmt = policy.Statement.find((s) => s.Action === action);
  if (!stmt) throw new Error(`No statement with Action=${action}`);
  return stmt;
};

const args = (overrides: Partial<Parameters<typeof buildRustfsSessionPolicy>[0]> = {}) => ({
  bucketName: "my-bucket",
  prefix: "",
  accessLevel: "read-write" as const,
  ...overrides,
});

describe("buildRustfsSessionPolicy", () => {
  test("empty prefix → whole-bucket scope (no s3:prefix Condition, GetObject on bucket/*)", () => {
    const policy = parse(buildRustfsSessionPolicy(args({ prefix: "" })));

    expect(policy.Version).toBe("2012-10-17");

    const list = findStatement(policy, "s3:ListBucket");
    expect(list.Effect).toBe("Allow");
    expect(list.Resource).toBe("arn:aws:s3:::my-bucket");
    expect(list.Condition?.StringLike).toBeUndefined();

    const get = findStatement(policy, "s3:GetObject");
    expect(get.Resource).toBe("arn:aws:s3:::my-bucket/*");

    const put = findStatement(policy, "s3:PutObject");
    expect(put.Resource).toBe("arn:aws:s3:::my-bucket/*");
  });

  test("prefix → ListBucket Condition anchors on `/`, GetObject on prefix/*", () => {
    const policy = parse(buildRustfsSessionPolicy(args({ prefix: "acme" })));

    const list = findStatement(policy, "s3:ListBucket");
    expect(list.Condition?.StringLike?.["s3:prefix"]).toEqual(["acme/", "acme/*"]);

    expect(findStatement(policy, "s3:GetObject").Resource).toBe("arn:aws:s3:::my-bucket/acme/*");
    expect(findStatement(policy, "s3:PutObject").Resource).toBe("arn:aws:s3:::my-bucket/acme/*");
  });

  test("read-only → no PutObject of any kind, DeleteObject only for sidecars", () => {
    const policy = parse(buildRustfsSessionPolicy(args({ accessLevel: "read-only" })));

    expect(policy.Statement.some((s) => s.Action === "s3:PutObject")).toBe(false);
    expect(policy.Statement.some((s) => s.Action === "s3:DeleteObject")).toBe(false);
  });

  test("annotate → sidecar Put/Delete only, no prefix-wide PutObject", () => {
    const policy = parse(buildRustfsSessionPolicy(args({ accessLevel: "annotate" })));

    expect(policy.Statement.some((s) => s.Sid === "PutOwnSidecars")).toBe(true);
    expect(policy.Statement.some((s) => s.Sid === "DeleteAnnotationSidecars")).toBe(true);
    expect(policy.Statement.some((s) => s.Sid === "PutObjectScopedToPrefix")).toBe(false);
  });

  test("read-write/admin → prefix grant subsumes the sidecar scope", () => {
    const policy = parse(buildRustfsSessionPolicy(args({ accessLevel: "admin" })));

    expect(policy.Statement.some((s) => s.Sid === "PutObjectScopedToPrefix")).toBe(true);
    expect(policy.Statement.some((s) => s.Sid === "PutOwnSidecars")).toBe(false);
  });

  // The invariant that motivated this module: the AWS variant's KMS statements
  // carry `Resource: "*"`, which RustFS's parser rejects (`type: 'unknown',
  // pattern: '*'`) — failing the whole mint. RustFS has no KMS, so no kms
  // action may ever appear, and no resource may be anything but an S3 ARN.
  test("NO kms actions, NO non-ARN resource — RustFS parser compatibility", () => {
    for (const accessLevel of ["read-only", "annotate", "read-write", "admin"] as const) {
      const policy = parse(buildRustfsSessionPolicy(args({ accessLevel })));

      for (const statement of policy.Statement) {
        expect(statement.Action.startsWith("s3:")).toBe(true);
        for (const resource of [statement.Resource].flat()) {
          expect(resource).toMatch(/^arn:aws:s3:::/);
        }
      }
    }
  });

  test("fails closed without a bucket name", () => {
    expect(() => buildRustfsSessionPolicy(args({ bucketName: "" }))).toThrow(/bucket/i);
  });

  test("fails closed on wildcard bucket names", () => {
    expect(() => buildRustfsSessionPolicy(args({ bucketName: "a*b" }))).toThrow(/wildcard/i);
  });

  test("fails closed on wildcard prefixes", () => {
    expect(() => buildRustfsSessionPolicy(args({ prefix: "a*b" }))).toThrow(/wildcard/i);
  });
});
