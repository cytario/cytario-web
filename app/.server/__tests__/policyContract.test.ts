import { actionMatchesPattern } from "@cloud-copilot/iam-expand";
import { describe, expect, test } from "vitest";

import {
  actionIsKnown,
  allConditionKeys,
  allRawActions,
  conditionKeyIsKnown,
  identityPolicyErrors,
  lintErrors,
  lintResourceErrors,
  parsePolicy,
  resourcePolicyErrors,
  simulateIdentityPolicy,
  statementBySid,
  type PolicyDocument,
} from "./iamPolicyTestUtils";
import {
  buildSessionPolicy,
  buildBrokerSessionPolicy,
  POLICY_SIZE_CEILING,
} from "../auth/sessionPolicy";
import {
  BUCKET_POLICY_MAX_BYTES,
  buildMergedPolicy,
  compileGrantStatements,
  parseBucketPolicy,
  type BucketPolicyGrant,
} from "../storage/bucketPolicy";
import { buildWriteSessionPolicy } from "../storage/writeSessionPolicy";
import { ORG_ROOT_SCOPE } from "~/utils/authorization";
import { ACCESS_LEVELS, type AccessLevel } from "~/utils/providerCatalog.schema";

/**
 * Contract tests for the *generated* IAM documents in this repo: the data-plane
 * inline session policy, the broker session policy, the Share write-session
 * policy, and the resource-based bucket policy.
 *
 * The sibling suites assert document shape as literals. These run the real
 * generated documents through AWS's published IAM data, catching the class of
 * defect that is valid JSON but rejected by AWS (unknown action, unknown
 * condition key, an action that cannot be expressed in a policy).
 */

const REGION = "eu-central-1";
const ORG = "vericura";
const BUCKET = "customer-bucket";
const ROLE_ARN = "arn:aws:iam::123456789012:role/cytario/provider-roles/lab-rw";
const KMS_KEY_ARN = "arn:aws:kms:eu-central-1:123456789012:key/abc123";

const MAX_LENGTH_PREFIX = "a".repeat(64);
const MAX_LENGTH_BUCKET = "bucket-" + "b".repeat(57);

const sessionDoc = (accessLevel: AccessLevel, prefix: string): PolicyDocument =>
  parsePolicy(buildSessionPolicy({ bucketName: BUCKET, prefix, region: REGION, accessLevel }));

const writeSessionDoc = (kmsKeyArn?: string): PolicyDocument =>
  parsePolicy(buildWriteSessionPolicy({ organization: ORG, bucketName: BUCKET, kmsKeyArn }));

const brokerDoc = (): PolicyDocument =>
  parsePolicy(
    buildBrokerSessionPolicy({
      inputs: [{ bucketName: "input-bucket", prefix: "in" }],
      output: { bucketName: "output-bucket", prefix: "out" },
      region: REGION,
    }),
  );

const grant = (overrides: Partial<BucketPolicyGrant> = {}): BucketPolicyGrant => ({
  organization: ORG,
  bucketName: BUCKET,
  groupPath: "Lab/TeamX",
  prefix: "projects/alpha",
  accessLevel: "read-only",
  roleArn: ROLE_ARN,
  ...overrides,
});

const bucketDoc = (overrides: Partial<BucketPolicyGrant> = {}): PolicyDocument =>
  ({
    Version: "2012-10-17",
    Statement: compileGrantStatements(grant(overrides)),
  }) as unknown as PolicyDocument;

const SESSION_DOCS: [string, PolicyDocument][] = ACCESS_LEVELS.flatMap(
  (level): [string, PolicyDocument][] => [
    [`session/${level}/whole-bucket`, sessionDoc(level, "")],
    [`session/${level}/prefixed`, sessionDoc(level, "projects/alpha")],
  ],
);

const IDENTITY_DOCS: [string, PolicyDocument][] = [
  ...SESSION_DOCS,
  ["broker-session", brokerDoc()],
  ["write-session", writeSessionDoc()],
  ["write-session+kms", writeSessionDoc(KMS_KEY_ARN)],
];

const BUCKET_DOCS: [string, PolicyDocument][] = [
  ...ACCESS_LEVELS.map((level): [string, PolicyDocument] => [
    `bucket-policy/${level}`,
    bucketDoc({ accessLevel: level }),
  ]),
  ["bucket-policy/org-root", bucketDoc({ groupPath: ORG_ROOT_SCOPE })],
  ["bucket-policy/whole-bucket", bucketDoc({ prefix: null })],
];

const ALL_DOCS: [string, PolicyDocument][] = [...IDENTITY_DOCS, ...BUCKET_DOCS];

const rawActionList = (policy: PolicyDocument): string[] => allRawActions(policy);

describe("generated policies are valid AWS documents", () => {
  test.each(IDENTITY_DOCS)("%s passes identity-policy validation", (_name, policy) => {
    expect(identityPolicyErrors(policy)).toEqual([]);
  });

  test.each(IDENTITY_DOCS)("%s passes the linter", (_name, policy) => {
    expect(lintErrors(policy)).toEqual([]);
  });

  test.each(BUCKET_DOCS)("%s passes resource-policy validation", (_name, policy) => {
    expect(resourcePolicyErrors(policy)).toEqual([]);
  });

  test.each(BUCKET_DOCS)("%s passes the resource-policy linter", (_name, policy) => {
    expect(lintResourceErrors(policy)).toEqual([]);
  });
});

describe("every action and condition key is real", () => {
  test.each(ALL_DOCS)("%s names only known actions", async (_name, policy) => {
    const unknown: string[] = [];
    for (const action of rawActionList(policy)) {
      if (!(await actionIsKnown(action))) unknown.push(action);
    }
    expect(unknown).toEqual([]);
  });

  test.each(ALL_DOCS)("%s names only known condition keys", async (_name, policy) => {
    const unknown: string[] = [];
    for (const key of allConditionKeys(policy)) {
      if (!(await conditionKeyIsKnown(key))) unknown.push(key);
    }
    expect(unknown).toEqual([]);
  });

  test("the tooling rejects the non-action metaphor and a typo", async () => {
    // `s3:CompleteMultipartUpload` is an API operation, not an IAM action —
    // S3 rejects a policy that lists it. Completing an upload is authorized by
    // PutObject. The generators must never emit it.
    expect(await actionIsKnown("s3:CompleteMultipartUpload")).toBe(false);
    expect(await actionIsKnown("s3:PutObjct")).toBe(false);
    expect(await conditionKeyIsKnown("kylo:azp")).toBe(false);
  });
});

describe("data-plane session policy", () => {
  test("read-only grants no write action", () => {
    const actions = rawActionList(sessionDoc("read-only", "projects/alpha"));
    expect(actions).not.toContain("s3:PutObject");
    expect(actions).not.toContain("s3:DeleteObject");
    expect(actions).toContain("s3:GetObject");
  });

  test("annotate grants PutObject only on the sidecar scope, not the prefix", () => {
    const policy = sessionDoc("annotate", "projects/alpha");
    expect(statementBySid(policy, "PutObjectScopedToPrefix")).toBeUndefined();
    expect(statementBySid(policy, "PutOwnSidecars")).toBeDefined();
    expect(rawActionList(policy)).toContain("s3:PutObject");
  });

  test.each(["read-write", "admin"] as const)("%s grants the prefix-wide PutObject", (level) => {
    const policy = sessionDoc(level, "projects/alpha");
    expect(statementBySid(policy, "PutObjectScopedToPrefix")).toBeDefined();
    expect(statementBySid(policy, "PutOwnSidecars")).toBeUndefined();
  });

  test("kms:Decrypt is present at every level and kms:GenerateDataKey only when writing", () => {
    for (const level of ACCESS_LEVELS) {
      const actions = rawActionList(sessionDoc(level, "projects/alpha"));
      expect(actions).toContain("kms:Decrypt");
      if (level === "read-only") {
        expect(actions).not.toContain("kms:GenerateDataKey");
      } else {
        expect(actions).toContain("kms:GenerateDataKey");
      }
    }
  });

  test("no session-policy action can grant s3:PutBucketPolicy", () => {
    for (const [, policy] of SESSION_DOCS) {
      for (const action of rawActionList(policy)) {
        expect(actionMatchesPattern("s3:PutBucketPolicy", action)).toBe(false);
      }
    }
  });

  test.each(SESSION_DOCS)("%s stays within the 2048-char Policy ceiling", (_name, policy) => {
    expect(JSON.stringify(policy).length).toBeLessThanOrEqual(POLICY_SIZE_CEILING);
  });

  test.each(ACCESS_LEVELS)(
    "%s stays within the ceiling for a max-length bucket and prefix",
    (level) => {
      const serialized = buildSessionPolicy({
        bucketName: MAX_LENGTH_BUCKET,
        prefix: MAX_LENGTH_PREFIX,
        region: REGION,
        accessLevel: level,
      });
      expect(serialized.length).toBeLessThanOrEqual(POLICY_SIZE_CEILING);
    },
  );
});

describe("structural guard rails", () => {
  test.each(ALL_DOCS)("%s never keys a tag condition on the wildcard value", (_name, policy) => {
    const offenders: string[] = [];
    for (const statement of policy.Statement) {
      for (const block of Object.values(statement.Condition ?? {})) {
        for (const [key, value] of Object.entries(block)) {
          if (!/(PrincipalTag|RequestTag)\//i.test(key)) continue;
          const values = Array.isArray(value) ? value : [value];
          if (values.includes("*")) offenders.push(key);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("session-policy simulation", () => {
  const PREFIXED = "projects/alpha";
  const OBJECT = `arn:aws:s3:::${BUCKET}/${PREFIXED}/foo.txt`;
  const SIDECAR = `arn:aws:s3:::${BUCKET}/${PREFIXED}/x.annotations.y.json`;
  const BUCKET_ARN = `arn:aws:s3:::${BUCKET}`;

  test.each(ACCESS_LEVELS)("%s can read under its prefix", async (level) => {
    const result = await simulateIdentityPolicy({
      policy: sessionDoc(level, PREFIXED),
      action: "s3:GetObject",
      resource: OBJECT,
    });
    expect(result.overallResult).toBe("Allowed");
  });

  test("a read-only session cannot write under its prefix", async () => {
    const result = await simulateIdentityPolicy({
      policy: sessionDoc("read-only", PREFIXED),
      action: "s3:PutObject",
      resource: OBJECT,
    });
    expect(result.overallResult).toBe("ImplicitlyDenied");
  });

  test("a read-write session can write under its prefix", async () => {
    const result = await simulateIdentityPolicy({
      policy: sessionDoc("read-write", PREFIXED),
      action: "s3:PutObject",
      resource: OBJECT,
    });
    expect(result.overallResult).toBe("Allowed");
  });

  test("an annotate session can write sidecars but not arbitrary objects", async () => {
    const sidecar = await simulateIdentityPolicy({
      policy: sessionDoc("annotate", PREFIXED),
      action: "s3:PutObject",
      resource: SIDECAR,
    });
    expect(sidecar.overallResult).toBe("Allowed");

    const arbitrary = await simulateIdentityPolicy({
      policy: sessionDoc("annotate", PREFIXED),
      action: "s3:PutObject",
      resource: OBJECT,
    });
    expect(arbitrary.overallResult).toBe("ImplicitlyDenied");
  });

  test("no session can write the bucket policy", async () => {
    for (const level of ACCESS_LEVELS) {
      const result = await simulateIdentityPolicy({
        policy: sessionDoc(level, PREFIXED),
        action: "s3:PutBucketPolicy",
        resource: BUCKET_ARN,
      });
      expect(result.overallResult).not.toBe("Allowed");
    }
  });
});

describe("broker and write session policies", () => {
  test("the broker session permits GetObject on inputs+output and PutObject on output only", () => {
    const policy = brokerDoc();
    const get = policy.Statement.find((statement) => statement.Action === "s3:GetObject");
    const put = policy.Statement.find((statement) => statement.Action === "s3:PutObject");
    expect(get).toBeDefined();
    expect(put).toBeDefined();
    expect(JSON.stringify(get?.Resource)).toContain("input-bucket");
    expect(JSON.stringify(put?.Resource)).toContain("output-bucket");
    expect(JSON.stringify(put?.Resource)).not.toContain("input-bucket");
  });

  test("the write session is scoped to bucket-policy read/write on the bucket", () => {
    const policy = writeSessionDoc();
    const statement = statementBySid(policy, "BucketPolicyReadWrite");
    expect(statement?.Action).toEqual(["s3:GetBucketPolicy", "s3:PutBucketPolicy"]);
    expect(statement?.Condition?.StringEquals).toEqual({ "aws:PrincipalTag/ORG": ORG });
  });

  test("the write session adds a KMS key-policy statement only when a key is supplied", () => {
    expect(statementBySid(writeSessionDoc(), "KmsKeyPolicyReadWrite")).toBeUndefined();
    const withKey = statementBySid(writeSessionDoc(KMS_KEY_ARN), "KmsKeyPolicyReadWrite");
    expect(withKey?.Action).toEqual(["kms:GetKeyPolicy", "kms:PutKeyPolicy"]);
    expect(withKey?.Resource).toBe(KMS_KEY_ARN);
  });

  test.each([
    ["broker-session", brokerDoc()],
    ["write-session", writeSessionDoc()],
    ["write-session+kms", writeSessionDoc(KMS_KEY_ARN)],
  ] as const)("%s stays within the 2048-char Policy ceiling", (_name, policy) => {
    expect(JSON.stringify(policy).length).toBeLessThanOrEqual(POLICY_SIZE_CEILING);
  });
});

describe("resource-based bucket policy", () => {
  test("every Allow carries the ORG principal-tag condition", () => {
    for (const [, policy] of BUCKET_DOCS) {
      for (const statement of policy.Statement) {
        if (statement.Effect !== "Allow") continue;
        const org = (statement.Condition?.StringEquals as Record<string, string> | undefined)?.[
          "aws:PrincipalTag/ORG"
        ];
        expect(org).toBe(ORG);
      }
    }
  });

  test("an org-root grant conditions on ORG only (no per-group tag)", () => {
    const policy = bucketDoc({ groupPath: ORG_ROOT_SCOPE });
    for (const statement of policy.Statement) {
      const keys = Object.keys(
        (statement.Condition?.StringEquals as Record<string, string> | undefined) ?? {},
      );
      expect(keys).toEqual(["aws:PrincipalTag/ORG"]);
    }
  });

  test.each(["read-write", "admin"] as const)(
    "%s grants the multipart write actions scoped to the object prefix",
    (level) => {
      const actions = rawActionList(bucketDoc({ accessLevel: level }));
      for (const action of [
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:AbortMultipartUpload",
        "s3:ListMultipartUploadParts",
      ]) {
        expect(actions).toContain(action);
      }
    },
  );

  test("read-only grants object reads but no writes", () => {
    const actions = rawActionList(bucketDoc({ accessLevel: "read-only" }));
    expect(actions).toContain("s3:GetObject");
    expect(actions).not.toContain("s3:PutObject");
    expect(actions).not.toContain("s3:DeleteObject");
  });

  test("bucket-metadata actions every S3 client issues on connect are granted", () => {
    const actions = rawActionList(bucketDoc({ accessLevel: "read-only" }));
    for (const action of [
      "s3:GetBucketLocation",
      "s3:ListBucketMultipartUploads",
      "s3:GetBucketOwnershipControls",
    ]) {
      expect(actions).toContain(action);
    }
  });

  test("annotate scopes PutObject to annotation and settings sidecars only", () => {
    const policy = bucketDoc({ accessLevel: "annotate" });
    const statement = policy.Statement.find((s) => {
      const actions = Array.isArray(s.Action) ? s.Action : [s.Action];
      return actions.includes("s3:PutObject");
    });
    const resources = Array.isArray(statement?.Resource)
      ? (statement?.Resource as string[])
      : [statement?.Resource as string];
    expect(resources).toContain(`arn:aws:s3:::${BUCKET}/projects/alpha/*.annotations.*.json`);
    expect(resources).toContain(`arn:aws:s3:::${BUCKET}/projects/alpha/settings.*.json`);
    expect(resources).not.toContain(`arn:aws:s3:::${BUCKET}/projects/alpha/*`);
  });

  test("a merged policy with foreign statements stays valid and within the size ceiling", async () => {
    const foreign = {
      Version: "2012-10-17",
      Statement: [
        {
          Sid: "ExternalRead",
          Effect: "Allow",
          Principal: { AWS: "arn:aws:iam::123456789012:role/external" },
          Action: "s3:GetObject",
          Resource: `arn:aws:s3:::${BUCKET}/public/*`,
        },
      ],
    };
    const merged = buildMergedPolicy(parseBucketPolicy(JSON.stringify(foreign)), [
      grant({ accessLevel: "read-write" }),
      grant({ accessLevel: "read-only", groupPath: "Lab/TeamY" }),
    ]);

    const document = parsePolicy(merged.serialized);
    expect(resourcePolicyErrors(document)).toEqual([]);
    expect(lintResourceErrors(document)).toEqual([]);
    expect(merged.serialized).toContain("ExternalRead");
    expect(Buffer.byteLength(merged.serialized, "utf8")).toBeLessThanOrEqual(
      BUCKET_POLICY_MAX_BYTES,
    );
    for (const action of allRawActions(document)) {
      expect(await actionIsKnown(action)).toBe(true);
    }
  });
});
