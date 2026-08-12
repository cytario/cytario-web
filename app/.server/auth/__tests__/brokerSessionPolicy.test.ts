import { describe, expect, test } from "vitest";

import { buildBrokerSessionPolicy, parseS3Uri, type S3Target } from "../sessionPolicy";

const REGION = "eu-central-1";
const INPUT: S3Target = { bucketName: "data-bucket", prefix: "cases/case1" };
const OUTPUT: S3Target = { bucketName: "data-bucket", prefix: "results/run42" };

describe("buildBrokerSessionPolicy (SRS-CY-416103)", () => {
  test("scopes PutObject to the output prefix only", () => {
    const policy = JSON.parse(
      buildBrokerSessionPolicy({ inputs: [INPUT], output: OUTPUT, region: REGION }),
    );
    const putStmt = policy.Statement.find(
      (s: { Sid: string }) => s.Sid === "PutObjectScopedToOutput",
    );
    expect(putStmt).toBeDefined();
    expect(putStmt.Action).toBe("s3:PutObject");
    expect(putStmt.Resource).toBe("arn:aws:s3:::data-bucket/results/run42/*");
  });

  test("GetObject covers both input and output prefixes", () => {
    const policy = JSON.parse(
      buildBrokerSessionPolicy({ inputs: [INPUT], output: OUTPUT, region: REGION }),
    );
    const getStmt = policy.Statement.find(
      (s: { Sid: string }) => s.Sid === "GetObjectScopedToTargets",
    );
    expect(getStmt).toBeDefined();
    expect(getStmt.Resource).toContain("arn:aws:s3:::data-bucket/cases/case1/*");
    expect(getStmt.Resource).toContain("arn:aws:s3:::data-bucket/results/run42/*");
  });

  test("includes kms:Decrypt and kms:GenerateDataKey", () => {
    const policy = JSON.parse(
      buildBrokerSessionPolicy({ inputs: [INPUT], output: OUTPUT, region: REGION }),
    );
    const sids = policy.Statement.map((s: { Sid: string }) => s.Sid);
    expect(sids).toContain("KmsDecryptViaS3");
    expect(sids).toContain("KmsGenerateDataKeyViaS3");
  });

  test("groups targets by bucket — one ListBucket per unique bucket", () => {
    const input = { bucketName: "input-bucket", prefix: "data" };
    const output = { bucketName: "output-bucket", prefix: "out" };
    const policy = JSON.parse(
      buildBrokerSessionPolicy({ inputs: [input], output, region: REGION }),
    );
    const listStmts = policy.Statement.filter(
      (s: { Action: string }) => s.Action === "s3:ListBucket",
    );
    expect(listStmts).toHaveLength(2);
    expect(listStmts[0].Resource).toBe("arn:aws:s3:::input-bucket");
    expect(listStmts[1].Resource).toBe("arn:aws:s3:::output-bucket");
  });

  test("same bucket input+output — one ListBucket with both prefixes", () => {
    const policy = JSON.parse(
      buildBrokerSessionPolicy({ inputs: [INPUT], output: OUTPUT, region: REGION }),
    );
    const listStmts = policy.Statement.filter(
      (s: { Action: string }) => s.Action === "s3:ListBucket",
    );
    expect(listStmts).toHaveLength(1);
    expect(listStmts[0].Resource).toBe("arn:aws:s3:::data-bucket");
    expect(listStmts[0].Condition.StringLike["s3:prefix"]).toContain("cases/case1/");
    expect(listStmts[0].Condition.StringLike["s3:prefix"]).toContain("results/run42/");
  });

  test("empty prefix scopes to whole bucket", () => {
    const policy = JSON.parse(
      buildBrokerSessionPolicy({
        inputs: [{ bucketName: "data-bucket", prefix: "" }],
        output: { bucketName: "data-bucket", prefix: "" },
        region: REGION,
      }),
    );
    const listStmt = policy.Statement.find((s: { Action: string }) => s.Action === "s3:ListBucket");
    expect(listStmt.Condition).toBeUndefined();
    const putStmt = policy.Statement.find(
      (s: { Sid: string }) => s.Sid === "PutObjectScopedToOutput",
    );
    expect(putStmt.Resource).toBe("arn:aws:s3:::data-bucket/*");
  });

  test("rejects wildcard in prefix", () => {
    expect(() =>
      buildBrokerSessionPolicy({
        inputs: [{ bucketName: "b", prefix: "data/*" }],
        output: OUTPUT,
        region: REGION,
      }),
    ).toThrow("wildcard");
  });

  test("output is compact JSON", () => {
    const serialized = buildBrokerSessionPolicy({
      inputs: [INPUT],
      output: OUTPUT,
      region: REGION,
    });
    expect(serialized).not.toContain("\n");
    expect(serialized).not.toContain("  ");
  });
});

describe("parseS3Uri", () => {
  test("parses s3://bucket/prefix", () => {
    expect(parseS3Uri("s3://my-bucket/data/output/")).toEqual({
      bucketName: "my-bucket",
      prefix: "data/output",
    });
  });

  test("parses s3://bucket (no prefix)", () => {
    expect(parseS3Uri("s3://my-bucket")).toEqual({
      bucketName: "my-bucket",
      prefix: "",
    });
  });

  test("returns null for non-s3 URI", () => {
    expect(parseS3Uri("https://example.com")).toBeNull();
  });

  test("returns null for unparseable string", () => {
    expect(parseS3Uri("not a url")).toBeNull();
  });
});
