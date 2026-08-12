import { describe, expect, test } from "vitest";

import { buildBrokerSessionPolicy } from "../sessionPolicy";

const VALID_ARGS = {
  bucketName: "my-bucket",
  prefix: "data/output",
  region: "eu-central-1",
};

describe("buildBrokerSessionPolicy (SRS-CY-416103)", () => {
  test("scopes PutObject to the output prefix, not annotation sidecars", () => {
    const policy = JSON.parse(buildBrokerSessionPolicy(VALID_ARGS));
    const putStmt = policy.Statement.find(
      (s: { Sid: string }) => s.Sid === "PutObjectScopedToOutputPrefix",
    );
    expect(putStmt).toBeDefined();
    expect(putStmt.Action).toBe("s3:PutObject");
    expect(putStmt.Resource).toBe("arn:aws:s3:::my-bucket/data/output/*");
  });

  test("includes list/get/kms statements from the browser path", () => {
    const policy = JSON.parse(buildBrokerSessionPolicy(VALID_ARGS));
    const sids = policy.Statement.map((s: { Sid: string }) => s.Sid);
    expect(sids).toContain("ListBucketScopedToPrefix");
    expect(sids).toContain("GetObjectScopedToPrefix");
    expect(sids).toContain("KmsDecryptViaS3");
    expect(sids).toContain("PutObjectScopedToOutputPrefix");
    expect(sids).toContain("KmsGenerateDataKeyViaS3");
  });

  test("includes kms:GenerateDataKey for writing to SSE-KMS-encrypted output (SRS-CY-416103)", () => {
    const policy = JSON.parse(buildBrokerSessionPolicy(VALID_ARGS));
    const genStmt = policy.Statement.find(
      (s: { Sid: string }) => s.Sid === "KmsGenerateDataKeyViaS3",
    );
    expect(genStmt).toBeDefined();
    expect(genStmt.Action).toBe("kms:GenerateDataKey");
    expect(genStmt.Resource).toBe("*");
    expect(genStmt.Condition.StringEquals["kms:ViaService"]).toBe("s3.eu-central-1.amazonaws.com");
  });

  test("PutObject is not scoped to annotation sidecars", () => {
    const policy = JSON.parse(buildBrokerSessionPolicy(VALID_ARGS));
    const putStmt = policy.Statement.find(
      (s: { Sid: string }) => s.Sid === "PutObjectScopedToOutputPrefix",
    );
    expect(putStmt.Resource).not.toContain("annotations");
  });

  test("empty prefix scopes PutObject to whole bucket", () => {
    const policy = JSON.parse(buildBrokerSessionPolicy({ ...VALID_ARGS, prefix: "" }));
    const putStmt = policy.Statement.find(
      (s: { Sid: string }) => s.Sid === "PutObjectScopedToOutputPrefix",
    );
    expect(putStmt.Resource).toBe("arn:aws:s3:::my-bucket/*");
  });

  test("rejects wildcard in prefix", () => {
    expect(() => buildBrokerSessionPolicy({ ...VALID_ARGS, prefix: "data/*" })).toThrow("wildcard");
  });

  test("strips leading/trailing slashes from prefix", () => {
    const policy = JSON.parse(buildBrokerSessionPolicy({ ...VALID_ARGS, prefix: "/data/output/" }));
    const putStmt = policy.Statement.find(
      (s: { Sid: string }) => s.Sid === "PutObjectScopedToOutputPrefix",
    );
    expect(putStmt.Resource).toBe("arn:aws:s3:::my-bucket/data/output/*");
  });

  test("output is compact JSON (no insignificant whitespace)", () => {
    const serialized = buildBrokerSessionPolicy(VALID_ARGS);
    expect(serialized).not.toContain("\n");
    expect(serialized).not.toContain("  ");
  });
});
