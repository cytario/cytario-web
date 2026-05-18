import { buildSessionPolicy } from "../sessionPolicy";

interface PolicyStatement {
  Sid: string;
  Effect: "Allow" | "Deny";
  Action: string;
  Resource: string;
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

describe("buildSessionPolicy", () => {
  test("empty prefix → whole-bucket scope (no s3:prefix Condition, GetObject on bucket/*)", () => {
    const policy = parse(buildSessionPolicy({ bucketName: "my-bucket", prefix: "" }));

    expect(policy.Version).toBe("2012-10-17");

    const list = findStatement(policy, "s3:ListBucket");
    expect(list.Effect).toBe("Allow");
    expect(list.Resource).toBe("arn:aws:s3:::my-bucket");
    // Whole-bucket policies must omit `s3:prefix` Condition entirely —
    // AWS evaluates an absent `prefix` query parameter as the empty
    // string, which `StringLike "*"` does not match.
    expect(list.Condition).toBeUndefined();

    const get = findStatement(policy, "s3:GetObject");
    expect(get.Effect).toBe("Allow");
    expect(get.Resource).toBe("arn:aws:s3:::my-bucket/*");
  });

  test("null prefix → whole-bucket scope (no s3:prefix Condition)", () => {
    const policy = parse(buildSessionPolicy({ bucketName: "my-bucket", prefix: null }));

    expect(findStatement(policy, "s3:ListBucket").Condition).toBeUndefined();
    expect(findStatement(policy, "s3:GetObject").Resource).toBe("arn:aws:s3:::my-bucket/*");
  });

  test("undefined prefix → whole-bucket scope (no s3:prefix Condition)", () => {
    const policy = parse(buildSessionPolicy({ bucketName: "my-bucket", prefix: undefined }));

    expect(findStatement(policy, "s3:ListBucket").Condition).toBeUndefined();
    expect(findStatement(policy, "s3:GetObject").Resource).toBe("arn:aws:s3:::my-bucket/*");
  });

  test("non-empty prefix → restricted listing and GetObject scope", () => {
    const policy = parse(buildSessionPolicy({ bucketName: "my-bucket", prefix: "foo" }));

    const list = findStatement(policy, "s3:ListBucket");
    expect(list.Resource).toBe("arn:aws:s3:::my-bucket");
    expect(list.Condition?.StringLike?.["s3:prefix"]).toEqual(["foo/", "foo/*"]);

    const get = findStatement(policy, "s3:GetObject");
    expect(get.Resource).toBe("arn:aws:s3:::my-bucket/foo/*");
  });

  test("prefix `foo` does NOT allow listing sibling prefixes `foobar`, `foo-other`", () => {
    // The policy's allowed `s3:prefix` values anchor to the trailing
    // slash so a `ListBucket prefix=foo` (no slash) would not match —
    // which prevents the leak of cross-tenant keys whose names happen
    // to start with the connection prefix.
    const policy = parse(buildSessionPolicy({ bucketName: "my-bucket", prefix: "foo" }));

    const allowed = findStatement(policy, "s3:ListBucket").Condition?.StringLike?.["s3:prefix"];
    expect(allowed).not.toContain("foo");
    expect(allowed).not.toContain("foobar");
    expect(allowed).not.toContain("foo-other");
  });

  test("multi-segment prefix preserved verbatim", () => {
    const policy = parse(buildSessionPolicy({ bucketName: "my-bucket", prefix: "tenant-a/data" }));

    expect(findStatement(policy, "s3:ListBucket").Condition?.StringLike?.["s3:prefix"]).toEqual([
      "tenant-a/data/",
      "tenant-a/data/*",
    ]);
    expect(findStatement(policy, "s3:GetObject").Resource).toBe(
      "arn:aws:s3:::my-bucket/tenant-a/data/*",
    );
  });

  test("leading slash stripped from prefix", () => {
    const policy = parse(buildSessionPolicy({ bucketName: "my-bucket", prefix: "/foo" }));

    expect(findStatement(policy, "s3:ListBucket").Condition?.StringLike?.["s3:prefix"]).toEqual([
      "foo/",
      "foo/*",
    ]);
    expect(findStatement(policy, "s3:GetObject").Resource).toBe("arn:aws:s3:::my-bucket/foo/*");
  });

  test("trailing slash stripped from prefix", () => {
    const policy = parse(buildSessionPolicy({ bucketName: "my-bucket", prefix: "foo/" }));

    expect(findStatement(policy, "s3:ListBucket").Condition?.StringLike?.["s3:prefix"]).toEqual([
      "foo/",
      "foo/*",
    ]);
    expect(findStatement(policy, "s3:GetObject").Resource).toBe("arn:aws:s3:::my-bucket/foo/*");
  });

  test("leading and trailing slashes both stripped from prefix", () => {
    const policy = parse(buildSessionPolicy({ bucketName: "my-bucket", prefix: "/foo/" }));

    expect(findStatement(policy, "s3:ListBucket").Condition?.StringLike?.["s3:prefix"]).toEqual([
      "foo/",
      "foo/*",
    ]);
    expect(findStatement(policy, "s3:GetObject").Resource).toBe("arn:aws:s3:::my-bucket/foo/*");
  });

  test("only-slashes prefix collapses to whole-bucket scope (no s3:prefix Condition)", () => {
    const policy = parse(buildSessionPolicy({ bucketName: "my-bucket", prefix: "///" }));

    expect(findStatement(policy, "s3:ListBucket").Condition).toBeUndefined();
    expect(findStatement(policy, "s3:GetObject").Resource).toBe("arn:aws:s3:::my-bucket/*");
  });

  test("stringified output is valid, parseable JSON", () => {
    const json = buildSessionPolicy({ bucketName: "my-bucket", prefix: "foo" });
    expect(() => JSON.parse(json)).not.toThrow();
    const parsed = JSON.parse(json) as ParsedPolicy;
    expect(parsed).toHaveProperty("Version", "2012-10-17");
    expect(Array.isArray(parsed.Statement)).toBe(true);
  });

  test("stringified output is well under 2048 chars for a max-realistic prefix (64 chars)", () => {
    const prefix = "a".repeat(64);
    const json = buildSessionPolicy({ bucketName: "my-bucket-with-some-length", prefix });
    // AWS strips whitespace before counting; JSON.stringify without indentation has none.
    expect(json.length).toBeLessThanOrEqual(2048);
  });

  test("rejects prefix containing IAM `*` wildcard", () => {
    expect(() => buildSessionPolicy({ bucketName: "shared", prefix: "tenant-a*" })).toThrow(
      /wildcard/i,
    );
  });

  test("rejects prefix containing IAM `?` wildcard", () => {
    expect(() => buildSessionPolicy({ bucketName: "shared", prefix: "tenant-?" })).toThrow(
      /wildcard/i,
    );
  });
});
