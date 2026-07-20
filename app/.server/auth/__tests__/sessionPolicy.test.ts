import { buildSessionPolicy, InlinePolicySizeError, POLICY_SIZE_CEILING } from "../sessionPolicy";

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

const SUBJECT = "4cd912ea-5136-4b2d-8959-d5e983cbea05";
const args = (overrides: Partial<Parameters<typeof buildSessionPolicy>[0]> = {}) => ({
  bucketName: "my-bucket",
  prefix: "",
  subject: SUBJECT,
  ...overrides,
});

describe("buildSessionPolicy", () => {
  test("empty prefix → whole-bucket scope (no s3:prefix Condition, GetObject on bucket/*)", () => {
    const policy = parse(buildSessionPolicy(args({ prefix: "" })));

    expect(policy.Version).toBe("2012-10-17");

    const list = findStatement(policy, "s3:ListBucket");
    expect(list.Effect).toBe("Allow");
    expect(list.Resource).toBe("arn:aws:s3:::my-bucket");
    // Whole-bucket policies must omit `s3:prefix` Condition entirely —
    // AWS evaluates an absent `prefix` query parameter as the empty
    // string, which `StringLike "*"` does not match.
    expect(list.Condition?.StringLike).toBeUndefined();

    const get = findStatement(policy, "s3:GetObject");
    expect(get.Effect).toBe("Allow");
    expect(get.Resource).toBe("arn:aws:s3:::my-bucket/*");
  });

  test("null prefix → whole-bucket scope (no s3:prefix Condition)", () => {
    const policy = parse(buildSessionPolicy(args({ prefix: null })));

    expect(findStatement(policy, "s3:ListBucket").Condition?.StringLike).toBeUndefined();
    expect(findStatement(policy, "s3:GetObject").Resource).toBe("arn:aws:s3:::my-bucket/*");
  });

  test("undefined prefix → whole-bucket scope (no s3:prefix Condition)", () => {
    const policy = parse(buildSessionPolicy(args({ prefix: undefined })));

    expect(findStatement(policy, "s3:ListBucket").Condition?.StringLike).toBeUndefined();
    expect(findStatement(policy, "s3:GetObject").Resource).toBe("arn:aws:s3:::my-bucket/*");
  });

  test("non-empty prefix → restricted listing and GetObject scope", () => {
    const policy = parse(buildSessionPolicy(args({ prefix: "foo" })));

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
    const policy = parse(buildSessionPolicy(args({ prefix: "foo" })));

    const allowed = findStatement(policy, "s3:ListBucket").Condition?.StringLike?.["s3:prefix"];
    expect(allowed).not.toContain("foo");
    expect(allowed).not.toContain("foobar");
    expect(allowed).not.toContain("foo-other");
  });

  test("multi-segment prefix preserved verbatim", () => {
    const policy = parse(buildSessionPolicy(args({ prefix: "tenant-a/data" })));

    expect(findStatement(policy, "s3:ListBucket").Condition?.StringLike?.["s3:prefix"]).toEqual([
      "tenant-a/data/",
      "tenant-a/data/*",
    ]);
    expect(findStatement(policy, "s3:GetObject").Resource).toBe(
      "arn:aws:s3:::my-bucket/tenant-a/data/*",
    );
  });

  test("leading slash stripped from prefix", () => {
    const policy = parse(buildSessionPolicy(args({ prefix: "/foo" })));

    expect(findStatement(policy, "s3:ListBucket").Condition?.StringLike?.["s3:prefix"]).toEqual([
      "foo/",
      "foo/*",
    ]);
    expect(findStatement(policy, "s3:GetObject").Resource).toBe("arn:aws:s3:::my-bucket/foo/*");
  });

  test("trailing slash stripped from prefix", () => {
    const policy = parse(buildSessionPolicy(args({ prefix: "foo/" })));

    expect(findStatement(policy, "s3:ListBucket").Condition?.StringLike?.["s3:prefix"]).toEqual([
      "foo/",
      "foo/*",
    ]);
    expect(findStatement(policy, "s3:GetObject").Resource).toBe("arn:aws:s3:::my-bucket/foo/*");
  });

  test("leading and trailing slashes both stripped from prefix", () => {
    const policy = parse(buildSessionPolicy(args({ prefix: "/foo/" })));

    expect(findStatement(policy, "s3:ListBucket").Condition?.StringLike?.["s3:prefix"]).toEqual([
      "foo/",
      "foo/*",
    ]);
    expect(findStatement(policy, "s3:GetObject").Resource).toBe("arn:aws:s3:::my-bucket/foo/*");
  });

  test("only-slashes prefix collapses to whole-bucket scope (no s3:prefix Condition)", () => {
    const policy = parse(buildSessionPolicy(args({ prefix: "///" })));

    expect(findStatement(policy, "s3:ListBucket").Condition?.StringLike).toBeUndefined();
    expect(findStatement(policy, "s3:GetObject").Resource).toBe("arn:aws:s3:::my-bucket/*");
  });

  test("stringified output is valid, parseable JSON", () => {
    const json = buildSessionPolicy(args({ prefix: "foo" }));
    expect(() => JSON.parse(json)).not.toThrow();
    const parsed = JSON.parse(json) as ParsedPolicy;
    expect(parsed).toHaveProperty("Version", "2012-10-17");
    expect(Array.isArray(parsed.Statement)).toBe(true);
  });

  test("stringified output is well under 2048 chars for a max-realistic prefix (64 chars)", () => {
    const prefix = "a".repeat(64);
    const json = buildSessionPolicy(
      args({
        bucketName: "my-bucket-with-some-length",
        prefix,
      }),
    );
    // AWS strips whitespace before counting; JSON.stringify without indentation has none.
    expect(json.length).toBeLessThanOrEqual(2048);
  });

  test("rejects prefix containing IAM `*` wildcard", () => {
    expect(() => buildSessionPolicy(args({ bucketName: "shared", prefix: "tenant-a*" }))).toThrow(
      /wildcard/i,
    );
  });

  test("rejects prefix containing IAM `?` wildcard", () => {
    expect(() => buildSessionPolicy(args({ bucketName: "shared", prefix: "tenant-?" }))).toThrow(
      /wildcard/i,
    );
  });

  test("throws InlinePolicySizeError when serialized policy exceeds the 2048-char ceiling", () => {
    // A bucket name + prefix long enough that the prefix repeats ~5x across
    // ListBucket / GetObject / PutObject Resource ARNs and pushes the serialized
    // document past the 2048-char ceiling.
    expect(() =>
      buildSessionPolicy(
        args({
          bucketName: "bucket-" + "x".repeat(200),
          prefix: "prefix-" + "y".repeat(400),
          subject: "subject-" + "z".repeat(100),
        }),
      ),
    ).toThrow(InlinePolicySizeError);
  });

  test("InlinePolicySizeError carries the actual length and ceiling", () => {
    try {
      buildSessionPolicy(
        args({
          bucketName: "b".repeat(800),
          prefix: "p".repeat(800),
          subject: "s".repeat(200),
        }),
      );
      throw new Error("expected buildSessionPolicy to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(InlinePolicySizeError);
      const typed = error as InlinePolicySizeError;
      expect(typed.ceiling).toBe(POLICY_SIZE_CEILING);
      expect(typed.actualLength).toBeGreaterThan(POLICY_SIZE_CEILING);
    }
  });

  test("emits no kms:Decrypt statement (Decrypt is granted by the role, not the inline policy)", () => {
    const policy = parse(buildSessionPolicy(args({ prefix: "foo" })));

    expect(policy.Statement.some((s) => s.Action === "kms:Decrypt")).toBe(false);
  });

  test("PutObject is scoped to the caller's OWN sidecar (`*.annotations.<sub>.json`)", () => {
    const policy = parse(buildSessionPolicy(args({ prefix: "foo" })));

    const put = findStatement(policy, "s3:PutObject");
    expect(put.Effect).toBe("Allow");
    expect(put.Resource).toBe(`arn:aws:s3:::my-bucket/foo/*.annotations.${SUBJECT}.json`);
    // The user segment is pinned, not a wildcard — no writing another user's file.
    expect(put.Resource).not.toContain("annotations.*.json");
  });

  test("PutObject scope omits the prefix segment for whole-bucket connections", () => {
    const policy = parse(buildSessionPolicy(args({ prefix: "" })));

    expect(findStatement(policy, "s3:PutObject").Resource).toBe(
      `arn:aws:s3:::my-bucket/*.annotations.${SUBJECT}.json`,
    );
  });

  test("throws when subject is empty (would widen Put scope to all users)", () => {
    expect(() => buildSessionPolicy(args({ subject: "" }))).toThrow(/Subject is required/);
  });

  test("rejects subject containing IAM wildcard characters", () => {
    expect(() => buildSessionPolicy(args({ subject: "*" }))).toThrow(/wildcard/i);
    expect(() => buildSessionPolicy(args({ subject: "user?" }))).toThrow(/wildcard/i);
  });
});

/**
 * SDS-CY-011108 (ARCH-1(B)): the data-plane inline session policy is a closed
 * allowlist that grants NO `s3:PutBucketPolicy` for ANY role it is minted against
 * — including a sharing-capable provider role. `buildSessionPolicy` takes no role
 * argument (the closed allowlist is identical regardless of the underlying role),
 * so we assert the property across representative argument variants.
 */
describe("buildSessionPolicy — PutBucketPolicy exclusion (closed allowlist)", () => {
  const collectActions = (json: string): string[] => {
    const policy = JSON.parse(json) as { Statement: { Action: string | string[] }[] };
    return policy.Statement.flatMap((s) => (Array.isArray(s.Action) ? s.Action : [s.Action]));
  };

  // Any action string that would grant PutBucketPolicy directly or by wildcard.
  const grantsPutBucketPolicy = (action: string): boolean => {
    if (action === "s3:PutBucketPolicy") return true;
    if (action === "*" || action === "s3:*") return true;
    // wildcard forms like "s3:Put*" / "s3:PutBucket*" would also cover it
    const asRegex = new RegExp(
      "^" + action.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$",
    );
    return asRegex.test("s3:PutBucketPolicy");
  };

  const variants = [
    args({ prefix: "" }),
    args({ prefix: "tenant-a/data" }),
    args({ bucketName: "sharing-capable-bucket", prefix: "shared" }),
  ];

  test.each(variants)("emits no action granting s3:PutBucketPolicy (%#)", (variantArgs) => {
    const actions = collectActions(buildSessionPolicy(variantArgs));
    expect(actions.length).toBeGreaterThan(0);
    for (const action of actions) {
      expect(grantsPutBucketPolicy(action)).toBe(false);
    }
    // and the exact string is definitively absent
    expect(actions).not.toContain("s3:PutBucketPolicy");
  });

  test("the guard itself catches a wildcard that would cover PutBucketPolicy", () => {
    // sanity-check the detector so the property test can't silently pass
    expect(grantsPutBucketPolicy("s3:Put*")).toBe(true);
    expect(grantsPutBucketPolicy("s3:*")).toBe(true);
    expect(grantsPutBucketPolicy("s3:GetObject")).toBe(false);
  });
});
