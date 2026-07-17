import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildSessionPolicy } from "~/.server/auth/sessionPolicy";
import { type BucketPolicyGrant, compileGrantStatements } from "~/.server/storage/bucketPolicy";

/**
 * SDS-CY-011102 / SRS-CY-43109 — architectural separation (ARCH-1).
 *
 * The bucket-policy generator (`bucketPolicy.ts`) and the inline-session-policy
 * generator (`buildSessionPolicy`, `sessionPolicy.ts`) must be distinct modules
 * that share NO policy-construction code, and each must independently carry the
 * `aws:PrincipalTag/ORG` condition (the bucket-policy generator additionally the
 * per-group tag). This is the compensating control for the accepted single-layer
 * residual: a defect in one generator cannot silently drop the tenant binding
 * from the other.
 */

const here = dirname(fileURLToPath(import.meta.url));
const SESSION_POLICY = resolve(here, "../../auth/sessionPolicy.ts");
const BUCKET_POLICY = resolve(here, "../bucketPolicy.ts");
const WRITE_SESSION_POLICY = resolve(here, "../writeSessionPolicy.ts");

const importSpecifiers = (source: string): string[] => {
  const specifiers: string[] = [];
  const re = /(?:import|export)\s[^;]*?\sfrom\s+["']([^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    specifiers.push(match[1]);
  }
  return specifiers;
};

describe("policy-generator architectural separation (negative import graph)", () => {
  const sessionSource = readFileSync(SESSION_POLICY, "utf8");
  const bucketSource = readFileSync(BUCKET_POLICY, "utf8");
  const writeSessionSource = readFileSync(WRITE_SESSION_POLICY, "utf8");

  const mentionsSessionPolicyImport = (specifier: string): boolean =>
    /(^|\/)sessionPolicy$/.test(specifier);
  const mentionsBucketPolicyImport = (specifier: string): boolean =>
    /(^|\/)storage\/bucketPolicy$/.test(specifier) || /(^|\/)bucketPolicy$/.test(specifier);

  test("the bucket-policy generator does not import the session-policy generator", () => {
    expect(importSpecifiers(bucketSource).some(mentionsSessionPolicyImport)).toBe(false);
  });

  test("the session-policy generator does not import the bucket-policy generator", () => {
    expect(importSpecifiers(sessionSource).some(mentionsBucketPolicyImport)).toBe(false);
  });

  test("the two generators share no common imported module (disjoint import sets)", () => {
    const sessionImports = new Set(importSpecifiers(sessionSource));
    const bucketImports = new Set(importSpecifiers(bucketSource));
    const shared = [...bucketImports].filter((s) => sessionImports.has(s));
    expect(shared).toEqual([]);
  });

  test("the write-session-policy generator is also independent of the bucket-policy generator", () => {
    expect(importSpecifiers(writeSessionSource).some(mentionsBucketPolicyImport)).toBe(false);
  });
});

describe("policy-generator architectural separation (positive output properties)", () => {
  test("every statement buildSessionPolicy emits carries aws:PrincipalTag/ORG", () => {
    const json = buildSessionPolicy({
      organization: "vericura",
      bucketName: "b",
      prefix: "p",
      region: "eu-central-1",
      subject: "sub-123",
    });
    const policy = JSON.parse(json) as {
      Statement: { Condition?: { StringEquals?: Record<string, string> } }[];
    };
    for (const stmt of policy.Statement) {
      expect(stmt.Condition?.StringEquals?.["aws:PrincipalTag/ORG"]).toBe("vericura");
    }
  });

  test("every Allow the bucket-policy generator emits carries ORG AND the per-group tag", () => {
    const grant: BucketPolicyGrant = {
      organization: "vericura",
      bucketName: "b",
      groupPath: "Lab/TeamX",
      prefix: "p",
      accessLevel: "read-write",
      roleArn: "arn:aws:iam::123456789012:role/cytario/provider-roles/lab-rw",
    };
    const statements = compileGrantStatements(grant);
    for (const stmt of statements) {
      expect(stmt.Effect).toBe("Allow");
      expect(stmt.Condition?.StringEquals?.["aws:PrincipalTag/ORG"]).toBe("vericura");
      expect(stmt.Condition?.StringEquals?.["aws:PrincipalTag/Lab/TeamX"]).toBe("1");
    }
  });
});
