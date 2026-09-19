import { buildRustfsWriteSessionPolicy } from "../rustfsWriteSessionPolicy";

describe("buildRustfsWriteSessionPolicy", () => {
  test("grants exactly the bucket-policy read/write on the one bucket", () => {
    const json = buildRustfsWriteSessionPolicy({ organization: "acme", bucketName: "tenants" });
    const policy = JSON.parse(json) as {
      Statement: Array<{ Effect: string; Action: string[]; Resource: string }>;
    };
    expect(policy.Statement).toHaveLength(1);
    expect(policy.Statement[0].Effect).toBe("Allow");
    expect(policy.Statement[0].Action).toEqual(["s3:GetBucketPolicy", "s3:PutBucketPolicy"]);
    expect(policy.Statement[0].Resource).toBe("arn:aws:s3:::tenants");
  });

  test("carries no aws:PrincipalTag condition — the management marker group is the org gate", () => {
    const json = buildRustfsWriteSessionPolicy({ organization: "acme", bucketName: "tenants" });
    const policy = JSON.parse(json) as {
      Statement: Array<{ Condition?: Record<string, unknown> }>;
    };
    for (const statement of policy.Statement) {
      expect(statement.Condition).toBeUndefined();
    }
  });

  test("fails closed without an organization", () => {
    expect(() =>
      buildRustfsWriteSessionPolicy({ organization: "", bucketName: "tenants" }),
    ).toThrow(/organization/i);
  });

  test("fails closed without a bucket name", () => {
    expect(() => buildRustfsWriteSessionPolicy({ organization: "acme", bucketName: "" })).toThrow(
      /bucket/i,
    );
  });

  test("fails closed on wildcard bucket names", () => {
    expect(() =>
      buildRustfsWriteSessionPolicy({ organization: "acme", bucketName: "a*b" }),
    ).toThrow(/wildcard/i);
  });
});
