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
    const putStmt = policy.Statement.find((s: { Action: string }) => s.Action === "s3:PutObject");
    expect(putStmt).toBeDefined();
    expect(putStmt.Resource).toBe("arn:aws:s3:::data-bucket/results/run42/*");
  });

  test("GetObject covers both input and output prefixes", () => {
    const policy = JSON.parse(
      buildBrokerSessionPolicy({ inputs: [INPUT], output: OUTPUT, region: REGION }),
    );
    const getStmt = policy.Statement.find((s: { Action: string }) => s.Action === "s3:GetObject");
    expect(getStmt).toBeDefined();
    expect(getStmt.Resource).toContain("arn:aws:s3:::data-bucket/cases/case1/*");
    expect(getStmt.Resource).toContain("arn:aws:s3:::data-bucket/results/run42/*");
  });

  test("includes kms:Decrypt and kms:GenerateDataKey in a single statement", () => {
    const policy = JSON.parse(
      buildBrokerSessionPolicy({ inputs: [INPUT], output: OUTPUT, region: REGION }),
    );
    const kmsStmt = policy.Statement.find(
      (s: { Action: string | string[] }) =>
        Array.isArray(s.Action) && s.Action.includes("kms:Decrypt"),
    );
    expect(kmsStmt).toBeDefined();
    expect(kmsStmt.Action).toEqual(["kms:Decrypt", "kms:GenerateDataKey"]);
    expect(kmsStmt.Resource).toBe("*");
  });

  test("KMS statement has no ViaService condition (role policy constrains it)", () => {
    const policy = JSON.parse(
      buildBrokerSessionPolicy({ inputs: [INPUT], output: OUTPUT, region: REGION }),
    );
    const kmsStmt = policy.Statement.find(
      (s: { Action: string | string[] }) =>
        Array.isArray(s.Action) && s.Action.includes("kms:Decrypt"),
    );
    expect(kmsStmt.Condition).toBeUndefined();
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
    expect(listStmts[0].Condition.StringLike["s3:prefix"]).toContain("cases/case1*");
    expect(listStmts[0].Condition.StringLike["s3:prefix"]).toContain("results/run42*");
  });

  test("uses single prefix wildcard pattern (prefix*) not double (prefix/ + prefix/*)", () => {
    const policy = JSON.parse(
      buildBrokerSessionPolicy({ inputs: [INPUT], output: OUTPUT, region: REGION }),
    );
    const listStmt = policy.Statement.find((s: { Action: string }) => s.Action === "s3:ListBucket");
    const prefixes = listStmt.Condition.StringLike["s3:prefix"] as string[];
    for (const p of prefixes) {
      expect(p.endsWith("*")).toBe(true);
      expect(p.endsWith("/*")).toBe(false);
    }
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
    const putStmt = policy.Statement.find((s: { Action: string }) => s.Action === "s3:PutObject");
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

  test("no Sid fields in statements", () => {
    const policy = JSON.parse(
      buildBrokerSessionPolicy({ inputs: [INPUT], output: OUTPUT, region: REGION }),
    );
    for (const stmt of policy.Statement) {
      expect(stmt.Sid).toBeUndefined();
    }
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

  test("preserves a literal space in the key", () => {
    expect(parseS3Uri("s3://data-bucket/upload test/jp2k.ome.tiff")).toEqual({
      bucketName: "data-bucket",
      prefix: "upload test/jp2k.ome.tiff",
    });
  });

  test("does not double-decode an already-encoded %20 — keeps literal %20", () => {
    // A ledger row that stores %20 must stay %20, not become a space: the
    // contract is "literal key bytes", matching whatever S3 actually sees.
    expect(parseS3Uri("s3://data-bucket/upload%20test/jp2k.ome.tiff")).toEqual({
      bucketName: "data-bucket",
      prefix: "upload%20test/jp2k.ome.tiff",
    });
  });

  test("preserves a literal '?' in the key — no query truncation", () => {
    expect(parseS3Uri("s3://b/foo?bar.txt")).toEqual({
      bucketName: "b",
      prefix: "foo?bar.txt",
    });
  });

  test("preserves a literal '#' in the key — no fragment truncation", () => {
    expect(parseS3Uri("s3://b/slide#2.ome.tiff")).toEqual({
      bucketName: "b",
      prefix: "slide#2.ome.tiff",
    });
  });

  test("preserves a literal '%' that is not a valid escape", () => {
    // `foo%bar` is a valid S3 key; decodeURIComponent would throw on it.
    expect(parseS3Uri("s3://b/foo%bar/baz")).toEqual({
      bucketName: "b",
      prefix: "foo%bar/baz",
    });
  });

  test("returns null for an empty bucket (s3:///key)", () => {
    expect(parseS3Uri("s3:///key")).toBeNull();
  });
});

describe("buildBrokerSessionPolicy — literal-key contract", () => {
  test("emits s3:prefix and Resource ARNs with literal spaces, not %20", () => {
    const input = {
      bucketName: "cytario-dev-data",
      prefix: "vericura.cytario/upload test/jp2k.ome.tiff",
    };
    const output = {
      bucketName: "cytario-dev-data",
      prefix: "vericura.cytario/upload test/jp2k.ome.tiff/output/jp2k",
    };
    const policy = JSON.parse(
      buildBrokerSessionPolicy({ inputs: [input], output, region: REGION }),
    );

    const listStmt = policy.Statement.find((s: { Action: string }) => s.Action === "s3:ListBucket");
    expect(listStmt).toBeDefined();
    const prefixes = listStmt.Condition.StringLike["s3:prefix"] as string[];
    for (const p of prefixes) {
      expect(p).not.toContain("%20");
      expect(p).toContain("upload test");
    }

    const getStmt = policy.Statement.find((s: { Action: string }) => s.Action === "s3:GetObject");
    expect(getStmt).toBeDefined();
    for (const r of getStmt.Resource as string[]) {
      expect(r).not.toContain("%20");
    }

    const putStmt = policy.Statement.find((s: { Action: string }) => s.Action === "s3:PutObject");
    expect(putStmt).toBeDefined();
    expect(putStmt.Resource as string).not.toContain("%20");
    expect(putStmt.Resource as string).toContain("upload test");
  });
});
