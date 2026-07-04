import { buildWriteSessionPolicy } from "../writeSessionPolicy";

interface Stmt {
  Sid: string;
  Effect: string;
  Action: string[];
  Resource: string;
  Condition?: { StringEquals?: Record<string, string> };
}
interface Doc {
  Version: string;
  Statement: Stmt[];
}
const parse = (json: string): Doc => JSON.parse(json) as Doc;

const ORG = "vericura";
const BUCKET = "customer-bucket";

describe("buildWriteSessionPolicy", () => {
  test("grants exactly Get/PutBucketPolicy on the one bucket ARN, ORG-conditioned", () => {
    const doc = parse(buildWriteSessionPolicy({ organization: ORG, bucketName: BUCKET }));

    expect(doc.Statement).toHaveLength(1);
    const stmt = doc.Statement[0];
    expect(stmt.Effect).toBe("Allow");
    expect(stmt.Action).toEqual(["s3:GetBucketPolicy", "s3:PutBucketPolicy"]);
    expect(stmt.Resource).toBe(`arn:aws:s3:::${BUCKET}`);
    expect(stmt.Condition?.StringEquals?.["aws:PrincipalTag/ORG"]).toBe(ORG);
  });

  test("adds a KMS key-policy statement scoped to the one CMK ARN when SSE-KMS", () => {
    const kmsKeyArn = "arn:aws:kms:eu-central-1:123456789012:key/abc-123";
    const doc = parse(
      buildWriteSessionPolicy({ organization: ORG, bucketName: BUCKET, kmsKeyArn }),
    );

    expect(doc.Statement).toHaveLength(2);
    const kms = doc.Statement.find((s) => s.Resource === kmsKeyArn)!;
    expect(kms.Action).toEqual(["kms:GetKeyPolicy", "kms:PutKeyPolicy"]);
    expect(kms.Condition?.StringEquals?.["aws:PrincipalTag/ORG"]).toBe(ORG);
  });

  test("every statement carries the ORG condition (defence-in-depth)", () => {
    const doc = parse(
      buildWriteSessionPolicy({
        organization: ORG,
        bucketName: BUCKET,
        kmsKeyArn: "arn:aws:kms:eu-central-1:123456789012:key/abc-123",
      }),
    );
    for (const stmt of doc.Statement) {
      expect(stmt.Condition?.StringEquals?.["aws:PrincipalTag/ORG"]).toBe(ORG);
    }
  });

  test("FAIL CLOSED: refuses an empty organization", () => {
    expect(() => buildWriteSessionPolicy({ organization: "", bucketName: BUCKET })).toThrow(
      /organization/i,
    );
  });

  test("FAIL CLOSED: refuses a wildcard bucket name", () => {
    expect(() => buildWriteSessionPolicy({ organization: ORG, bucketName: "b*" })).toThrow(
      /wildcard/i,
    );
  });
});
