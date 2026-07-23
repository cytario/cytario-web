import {
  BUCKET_POLICY_MAX_BYTES,
  MANAGED_SID_PREFIX,
  type BucketPolicyDocument,
  type BucketPolicyGrant,
  type PolicyStatement,
  buildMergedPolicy,
  compileGrantStatements,
  isManagedStatement,
  parseBucketPolicy,
} from "../bucketPolicy";

const ORG = "vericura";
const BUCKET = "customer-bucket";

const grant = (overrides: Partial<BucketPolicyGrant> = {}): BucketPolicyGrant => ({
  organization: ORG,
  bucketName: BUCKET,
  groupPath: "Lab/TeamX",
  prefix: "projects/alpha",
  accessLevel: "read-only",
  roleArn: "arn:aws:iam::123456789012:role/cytario/provider-roles/lab-rw",
  ...overrides,
});

const findByAction = (statements: PolicyStatement[], action: string): PolicyStatement => {
  const stmt = statements.find((s) => {
    const actions = Array.isArray(s.Action) ? s.Action : [s.Action];
    return actions.includes(action);
  });
  if (!stmt) throw new Error(`No statement with Action=${action}`);
  return stmt;
};

describe("compileGrantStatements", () => {
  test("read-only grant compiles ListBucket + GetObject with ORG and per-group conditions", () => {
    const statements = compileGrantStatements(grant());

    const list = findByAction(statements, "s3:ListBucket");
    expect(list.Effect).toBe("Allow");
    expect(list.Resource).toBe(`arn:aws:s3:::${BUCKET}`);
    expect(list.Condition?.StringEquals?.["aws:PrincipalTag/ORG"]).toBe(ORG);
    expect(list.Condition?.StringEquals?.["aws:PrincipalTag/Lab/TeamX"]).toBe("1");
    // prefixes trailing-slash anchored
    expect(list.Condition?.StringLike?.["s3:prefix"]).toEqual([
      "projects/alpha/",
      "projects/alpha/*",
    ]);

    const get = findByAction(statements, "s3:GetObject");
    expect(get.Resource).toBe(`arn:aws:s3:::${BUCKET}/projects/alpha/*`);
    expect(get.Condition?.StringEquals?.["aws:PrincipalTag/ORG"]).toBe(ORG);
    expect(get.Condition?.StringEquals?.["aws:PrincipalTag/Lab/TeamX"]).toBe("1");
  });

  test("read-only grant grants NO write actions", () => {
    const statements = compileGrantStatements(grant({ accessLevel: "read-only" }));
    const allActions = statements.flatMap((s) => (Array.isArray(s.Action) ? s.Action : [s.Action]));
    expect(allActions).not.toContain("s3:PutObject");
    expect(allActions).not.toContain("s3:DeleteObject");
    expect(allActions).not.toContain("s3:PutBucketPolicy");
  });

  test("read-write grant adds PutObject + DeleteObject on the object statement", () => {
    const statements = compileGrantStatements(grant({ accessLevel: "read-write" }));
    const objectStmt = statements.find(
      (s) => s.Resource === `arn:aws:s3:::${BUCKET}/projects/alpha/*`,
    )!;
    const actions = Array.isArray(objectStmt.Action) ? objectStmt.Action : [objectStmt.Action];
    expect(actions).toContain("s3:GetObject");
    expect(actions).toContain("s3:PutObject");
    expect(actions).toContain("s3:DeleteObject");
    // even a sharing-capable read-write grant never grants PutBucketPolicy
    expect(actions).not.toContain("s3:PutBucketPolicy");
  });

  test("empty prefix → whole-bucket object ARN and no s3:prefix condition", () => {
    const statements = compileGrantStatements(grant({ prefix: "" }));
    const list = findByAction(statements, "s3:ListBucket");
    expect(list.Condition?.StringLike).toBeUndefined();
    const get = findByAction(statements, "s3:GetObject");
    expect(get.Resource).toBe(`arn:aws:s3:::${BUCKET}/*`);
  });

  test("leading/trailing slashes stripped from prefix", () => {
    const statements = compileGrantStatements(grant({ prefix: "/projects/alpha/" }));
    const get = findByAction(statements, "s3:GetObject");
    expect(get.Resource).toBe(`arn:aws:s3:::${BUCKET}/projects/alpha/*`);
  });

  test("managed statements carry the Cytario Sid prefix", () => {
    const statements = compileGrantStatements(grant());
    for (const statement of statements) {
      expect(statement.Sid?.startsWith(MANAGED_SID_PREFIX)).toBe(true);
      expect(isManagedStatement(statement)).toBe(true);
    }
  });

  test("same grant compiles to the same Sids (deterministic → idempotent)", () => {
    const a = compileGrantStatements(grant());
    const b = compileGrantStatements(grant());
    expect(a.map((s) => s.Sid)).toEqual(b.map((s) => s.Sid));
  });

  test("FAIL CLOSED: refuses a grant with no organization", () => {
    expect(() => compileGrantStatements(grant({ organization: "" }))).toThrow(/organization/i);
  });

  test("FAIL CLOSED: refuses a grant with no target group path", () => {
    expect(() => compileGrantStatements(grant({ groupPath: "" }))).toThrow(/group/i);
  });

  test("FAIL CLOSED: refuses a prefix containing wildcard characters", () => {
    expect(() => compileGrantStatements(grant({ prefix: "tenant-*" }))).toThrow(/wildcard/i);
  });
});

describe("buildMergedPolicy — read-merge-write", () => {
  test("adds managed statements to an empty policy", () => {
    const result = buildMergedPolicy(parseBucketPolicy(null), [grant()]);
    expect(result.document.Statement.length).toBe(2);
    expect(result.document.Statement.every(isManagedStatement)).toBe(true);
  });

  test("PRESERVES foreign statements untouched", () => {
    const foreign: PolicyStatement = {
      Sid: "CustomerDenyEverythingElse",
      Effect: "Deny",
      Principal: "*",
      Action: "s3:*",
      Resource: `arn:aws:s3:::${BUCKET}/*`,
    };
    const live: BucketPolicyDocument = { Version: "2012-10-17", Statement: [foreign] };

    const result = buildMergedPolicy(live, [grant()]);

    const stillThere = result.document.Statement.find(
      (s) => s.Sid === "CustomerDenyEverythingElse",
    );
    expect(stillThere).toEqual(foreign);
    // managed statements were added alongside, not replacing the foreign one
    expect(result.document.Statement.filter(isManagedStatement).length).toBe(2);
  });

  test("re-applying the same grant set is idempotent (no duplicate statements)", () => {
    const first = buildMergedPolicy(parseBucketPolicy(null), [grant()]);
    const second = buildMergedPolicy(first.document, [grant()]);
    expect(second.document.Statement.length).toBe(first.document.Statement.length);
    expect(second.serialized).toBe(first.serialized);
  });

  test("replaces stale managed statements when the grant set changes", () => {
    const first = buildMergedPolicy(parseBucketPolicy(null), [
      grant({ prefix: "old", accessLevel: "read-only" }),
    ]);
    const second = buildMergedPolicy(first.document, [
      grant({ prefix: "new", accessLevel: "read-only" }),
    ]);
    const objectArns = second.document.Statement.filter(isManagedStatement).map((s) => s.Resource);
    expect(JSON.stringify(objectArns)).toContain("new/*");
    expect(JSON.stringify(objectArns)).not.toContain("old/*");
  });

  test("empty grant set removes all managed statements (full revoke) but keeps foreign", () => {
    const foreign: PolicyStatement = {
      Sid: "Foreign",
      Effect: "Allow",
      Action: "s3:GetObject",
      Resource: `arn:aws:s3:::${BUCKET}/shared/*`,
    };
    const seeded = buildMergedPolicy({ Version: "2012-10-17", Statement: [foreign] }, [grant()]);
    const revoked = buildMergedPolicy(seeded.document, []);
    expect(revoked.document.Statement).toEqual([foreign]);
  });

  test("coalesces same (group, access) across prefixes into one multi-Resource object statement", () => {
    const result = buildMergedPolicy(parseBucketPolicy(null), [
      grant({ prefix: "a", accessLevel: "read-write" }),
      grant({ prefix: "b", accessLevel: "read-write" }),
    ]);
    const objectStatements = result.document.Statement.filter((s) => {
      const actions = Array.isArray(s.Action) ? s.Action : [s.Action];
      return actions.includes("s3:GetObject");
    });
    // both prefixes fold into a single object statement with two resources
    expect(objectStatements.length).toBe(1);
    const resources = objectStatements[0].Resource as string[];
    expect(resources).toContain(`arn:aws:s3:::${BUCKET}/a/*`);
    expect(resources).toContain(`arn:aws:s3:::${BUCKET}/b/*`);
  });

  test("grants to DIFFERENT groups are NOT coalesced (distinct per-group condition)", () => {
    const result = buildMergedPolicy(parseBucketPolicy(null), [
      grant({ groupPath: "Lab/TeamX", prefix: "shared", accessLevel: "read-only" }),
      grant({ groupPath: "Lab/TeamY", prefix: "shared", accessLevel: "read-only" }),
    ]);
    const objectStatements = result.document.Statement.filter((s) => {
      const actions = Array.isArray(s.Action) ? s.Action : [s.Action];
      return actions.includes("s3:GetObject");
    });
    expect(objectStatements.length).toBe(2);
  });

  test("C-347: grants to the SAME group+prefix with DIFFERENT roles coalesce into one statement with a multi-value Principal", () => {
    const result = buildMergedPolicy(parseBucketPolicy(null), [
      grant({
        groupPath: "Lab/TeamX",
        prefix: "shared",
        accessLevel: "read-only",
        roleArn: "arn:aws:iam::123456789012:role/cytario/provider-roles/role-a",
      }),
      grant({
        groupPath: "Lab/TeamX",
        prefix: "shared",
        accessLevel: "read-only",
        roleArn: "arn:aws:iam::123456789012:role/cytario/provider-roles/role-b",
      }),
    ]);
    const objectStatements = result.document.Statement.filter((s) => {
      const actions = Array.isArray(s.Action) ? s.Action : [s.Action];
      return actions.includes("s3:GetObject");
    });
    expect(objectStatements.length).toBe(1);
    const principal = objectStatements[0].Principal as { AWS: string | string[] };
    const aws = Array.isArray(principal.AWS) ? principal.AWS : [principal.AWS];
    expect(aws).toHaveLength(2);
    expect(aws).toContain("arn:aws:iam::123456789012:role/cytario/provider-roles/role-a");
    expect(aws).toContain("arn:aws:iam::123456789012:role/cytario/provider-roles/role-b");
  });

  test("FAIL CLOSED: over-20KB coalesced document throws and yields no policy", () => {
    // Each grant to a distinct group produces distinct (non-coalescible)
    // statements; enough of them push the serialized document past 20 KB.
    const many: BucketPolicyGrant[] = [];
    for (let i = 0; i < 400; i++) {
      many.push(
        grant({ groupPath: `Lab/Team${i}`, prefix: `projects/really-long-prefix-name-${i}` }),
      );
    }
    expect(() => buildMergedPolicy(parseBucketPolicy(null), many)).toThrow(/20480-byte limit/);
  });

  test("a document just under the ceiling is emitted", () => {
    const result = buildMergedPolicy(parseBucketPolicy(null), [grant()]);
    expect(Buffer.byteLength(result.serialized, "utf8")).toBeLessThan(BUCKET_POLICY_MAX_BYTES);
  });
});

describe("parseBucketPolicy", () => {
  test("null / empty → empty policy", () => {
    expect(parseBucketPolicy(null).Statement).toEqual([]);
    expect(parseBucketPolicy("").Statement).toEqual([]);
  });

  test("FAIL CLOSED: malformed JSON throws rather than overwriting", () => {
    expect(() => parseBucketPolicy("{not json")).toThrow(/valid JSON/i);
  });

  test("FAIL CLOSED: object without a Statement array throws", () => {
    expect(() => parseBucketPolicy('{"Version":"2012-10-17"}')).toThrow(/Statement/i);
  });
});
