import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  type RustfsBucketPolicyGrant,
  compileGrantStatements,
} from "~/.server/storage/rustfsBucketPolicy";

/**
 * Architectural separation for the RustFS policy-generator pair (the ARCH-1
 * rule, extended): the RustFS bucket-policy generator and the write-session
 * generator must be distinct modules sharing no policy-construction code, and
 * the RustFS generator must independently carry the org-marker `jwt:groups`
 * condition on every Allow it emits.
 */

const here = dirname(fileURLToPath(import.meta.url));
const RUSTFS_BUCKET_POLICY = resolve(here, "../rustfsBucketPolicy.ts");
const RUSTFS_WRITE_SESSION_POLICY = resolve(here, "../rustfsWriteSessionPolicy.ts");

const importSpecifiers = (source: string): string[] => {
  const specifiers: string[] = [];
  const re = /(?:import|export)\s[^;]*?from\s+["']([^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    specifiers.push(match[1]);
  }
  return specifiers;
};

describe("rustfs policy-generator architectural separation", () => {
  const bucketSource = readFileSync(RUSTFS_BUCKET_POLICY, "utf8");
  const writeSessionSource = readFileSync(RUSTFS_WRITE_SESSION_POLICY, "utf8");

  test("the RustFS generators import neither the AWS generators nor each other", () => {
    const mentionsOther = (specifier: string): boolean =>
      /(^|\/)storage\/bucketPolicy$/.test(specifier) ||
      /(^|\/)bucketPolicy$/.test(specifier) ||
      /(^|\/)rustfsBucketPolicy$/.test(specifier) ||
      /(^|\/)writeSessionPolicy$/.test(specifier) ||
      /(^|\/)sessionPolicy$/.test(specifier);
    expect(importSpecifiers(bucketSource).some(mentionsOther)).toBe(false);
    expect(importSpecifiers(writeSessionSource).some(mentionsOther)).toBe(false);
  });

  test("every Allow the RustFS generator emits carries the org-marker jwt:groups condition", () => {
    const grants: RustfsBucketPolicyGrant[] = [
      {
        organization: "acme",
        bucketName: "tenants",
        groupPath: "Lab/TeamX",
        prefix: "data",
        accessLevel: "annotate",
      },
      {
        organization: "acme",
        bucketName: "tenants",
        groupPath: "*",
        prefix: null,
        accessLevel: "admin",
      },
    ];
    for (const grant of grants) {
      const statements = compileGrantStatements(grant);
      for (const statement of statements) {
        expect(statement.Effect).toBe("Allow");
        const groups = statement.Condition?.["ForAnyValue:StringEquals"]?.["jwt:groups"];
        expect(Array.isArray(groups)).toBe(true);
        expect((groups as string[]).some((g) => g.startsWith("cytario-org-"))).toBe(true);
      }
    }
  });
});
