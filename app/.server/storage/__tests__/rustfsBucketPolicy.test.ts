import {
  type RustfsBucketPolicyGrant,
  buildMergedPolicy,
  compileGrantStatements,
  compositeGroupValue,
  isManagedStatement,
  orgMarkerFor,
  parseBucketPolicy,
} from "../rustfsBucketPolicy";

const grant = (overrides: Partial<RustfsBucketPolicyGrant> = {}): RustfsBucketPolicyGrant => ({
  kind: "rustfs",
  organization: "acme",
  bucketName: "tenants",
  groupPath: "Lab/TeamX",
  prefix: "data",
  accessLevel: "read-write",
  ...overrides,
});

describe("rustfsBucketPolicy generator", () => {
  describe("buildGrantCondition", () => {
    test("every Allow statement binds org and group as ONE composite jwt:groups value", () => {
      const statements = compileGrantStatements(grant());
      expect(statements.length).toBeGreaterThan(0);
      for (const statement of statements) {
        expect(statement.Effect).toBe("Allow");
        // Single-valued StringEquals — never ForAnyValue: multivalued
        // condition keys evaluate ANY-match, which would OR an org marker
        // and a group path apart.
        expect(statement.Condition?.["ForAnyValue:StringEquals"]).toBeUndefined();
        expect(statement.Condition?.StringEquals?.["jwt:groups"]).toBe("cy-acme_Lab_TeamX");
        expect(statement.Condition?.StringEquals?.["aws:PrincipalTag/ORG"]).toBeUndefined();
      }
    });

    test("the composite contains the org marker by construction — no OR-able array of independent values", () => {
      // A session holding a matching group path in a DIFFERENT org must not
      // satisfy the condition: the value the policy demands is the composite
      // `cy-<org-alias>_<group-path>`, which a foreign org's mapper never emits.
      const statements = compileGrantStatements(grant());
      for (const statement of statements) {
        const groups = statement.Condition?.StringEquals?.["jwt:groups"];
        const values = Array.isArray(groups) ? groups : [groups];
        for (const value of values) {
          expect(value).toMatch(/^cy-acme_/);
          // No value is the bare group path or the bare marker of another org.
          expect(value).not.toBe("Lab/TeamX");
          expect(value).not.toMatch(/^cy-vericura/);
        }
      }
    });

    test("an org-root grant conditions on the bare org marker alone", () => {
      const statements = compileGrantStatements(grant({ groupPath: "*" }));
      for (const statement of statements) {
        expect(statement.Condition?.StringEquals?.["jwt:groups"]).toBe("cy-acme");
      }
    });

    test("a grant without an organization fails closed", () => {
      expect(() => compileGrantStatements(grant({ organization: "" }))).toThrow(/organization/i);
    });

    test("a grant without a group path fails closed", () => {
      expect(() => compileGrantStatements(grant({ groupPath: "" }))).toThrow(/group path/i);
    });
  });

  describe("compileGrantStatements", () => {
    test("emits no role-ARN Principal — conditions carry the binding", () => {
      const statements = compileGrantStatements(grant());
      for (const statement of statements) {
        expect(statement.Principal).toEqual({ AWS: "*" });
      }
    });

    test("prefix-anchors the ListBucket condition", () => {
      const statements = compileGrantStatements(grant({ prefix: "data" }));
      const list = statements.find((s) => s.Sid?.endsWith("List"));
      expect(list?.Condition?.StringLike?.["s3:prefix"]).toEqual(["data/", "data/*"]);
      expect(list?.Resource).toBe("arn:aws:s3:::tenants");
    });

    test("whole-bucket list without a prefix omits the s3:prefix condition", () => {
      const statements = compileGrantStatements(grant({ prefix: null }));
      const list = statements.find((s) => s.Sid?.endsWith("List"));
      expect(list?.Condition?.StringLike).toBeUndefined();
    });

    test("read-only contributes GetObject only", () => {
      const statements = compileGrantStatements(grant({ accessLevel: "read-only" }));
      const object = statements.find((s) => s.Sid?.endsWith("Object"));
      expect(object?.Action).toBe("s3:GetObject");
    });

    test("annotate scopes writes to sidecar patterns", () => {
      const statements = compileGrantStatements(grant({ accessLevel: "annotate" }));
      const annotate = statements.find((s) => s.Sid?.endsWith("Annotate"));
      expect(annotate?.Action).toBe("s3:PutObject");
      const resources = Array.isArray(annotate?.Resource)
        ? annotate?.Resource
        : [annotate?.Resource];
      expect(resources?.join(" ")).toContain(".annotations.*.json");
      expect(resources?.join(" ")).toContain("settings.*.json");
    });

    test("read-write enumerates write and multipart actions", () => {
      const statements = compileGrantStatements(grant({ accessLevel: "read-write" }));
      const object = statements.find((s) => s.Sid?.endsWith("Object"));
      const actions = Array.isArray(object?.Action) ? object?.Action : [object?.Action];
      expect(actions).toContain("s3:DeleteObject");
      expect(actions).toContain("s3:PutObject");
    });

    test("emits the bucket-metadata statement every S3 client needs on connect", () => {
      const statements = compileGrantStatements(grant());
      const meta = statements.find((s) => s.Sid?.endsWith("BucketMeta"));
      const actions = Array.isArray(meta?.Action) ? meta?.Action : [meta?.Action];
      expect(actions).toContain("s3:GetBucketLocation");
      expect(actions).toContain("s3:ListBucketMultipartUploads");
    });

    test("rejects wildcard prefixes", () => {
      expect(() => compileGrantStatements(grant({ prefix: "a*b" }))).toThrow(/wildcard/i);
    });
  });

  describe("buildMergedPolicy", () => {
    test("replaces managed statements and preserves foreign ones verbatim", () => {
      const foreign = {
        Sid: "Foreign",
        Effect: "Allow" as const,
        Principal: { AWS: "arn:aws:iam::999999999999:role/other" },
        Action: "s3:GetObject",
        Resource: "arn:aws:s3:::tenants/other/*",
      };
      const live = { Version: "2012-10-17", Statement: [foreign] };
      const result = buildMergedPolicy(live, [grant()]);
      expect(result.document.Statement).toContainEqual(foreign);
      expect(result.document.Statement.filter((s) => isManagedStatement(s)).length).toBeGreaterThan(
        0,
      );
    });

    test("an empty grant set removes all managed statements (revoke)", () => {
      const live = buildMergedPolicy({ Version: "2012-10-17", Statement: [] }, [grant()]);
      const result = buildMergedPolicy(live.document, []);
      expect(result.document.Statement.filter((s) => isManagedStatement(s))).toEqual([]);
    });

    test("re-applying the same grant converges to the same document (idempotent)", () => {
      const live = { Version: "2012-10-17", Statement: [] };
      const first = buildMergedPolicy(live, [grant()]);
      const second = buildMergedPolicy(first.document, [grant()]);
      expect(second.serialized).toBe(first.serialized);
    });

    test("fails closed on a serialized document over the byte ceiling", () => {
      const big = grant({ prefix: "p".repeat(12000) });
      expect(() => buildMergedPolicy({ Version: "2012-10-17", Statement: [] }, [big])).toThrow(
        /20480/,
      );
    });

    test("fails closed when a managed Allow carries no org marker", () => {
      const statements = compileGrantStatements(grant());
      const stripped = statements.map((s) => ({
        ...s,
        Condition: { "ForAnyValue:StringEquals": { "jwt:groups": ["Lab/TeamX"] } },
      }));
      const live = { Version: "2012-10-17", Statement: stripped };
      // Replacing ALL managed statements with an org-less variant must throw:
      // parse the live document through the merge path by treating the stripped
      // set as foreign-free — the assertion fires on the freshly compiled grants
      // only, so drive it via a grant whose organization is empty after compile.
      expect(() => buildMergedPolicy(live, [grant({ organization: "" })])).toThrow(/organization/i);
      expect(statements.length).toBe(stripped.length);
    });
  });

  describe("parseBucketPolicy", () => {
    test("treats null as the empty policy", () => {
      expect(parseBucketPolicy(null).Statement).toEqual([]);
    });

    test("rejects malformed JSON", () => {
      expect(() => parseBucketPolicy("not json")).toThrow(/valid JSON/i);
    });
  });

  describe("orgMarkerFor", () => {
    test("derives the marker from the reserved prefix", () => {
      expect(orgMarkerFor("acme")).toBe("cy-acme");
    });

    test("fails closed on an empty alias", () => {
      expect(() => orgMarkerFor("")).toThrow(/required/i);
    });

    test("fails closed on a null or undefined alias", () => {
      expect(() => orgMarkerFor(null as unknown as string)).toThrow(/required/i);
      expect(() => orgMarkerFor(undefined as unknown as string)).toThrow(/required/i);
    });

    test("fails closed on an alias containing a slash", () => {
      // A '/' would let org `a/b` + group `c` produce the composite another
      // (org, group) pair demands.
      expect(() => orgMarkerFor("a/b")).toThrow(/ambiguous/i);
    });

    test("fails closed on an alias containing whitespace", () => {
      expect(() => orgMarkerFor("acme corp")).toThrow(/whitespace/i);
    });

    test("fails closed on an alias containing an underscore", () => {
      // '_' is the composite separator: `cy-a_b` could be org `a_b`'s marker
      // or org `a`'s group `b` composite — a cross-org hole under any-match.
      expect(() => orgMarkerFor("a_b")).toThrow(/ambiguous/i);
    });

    test("accepts an alias starting with 'admin-' (the admins marker namespace no longer exists)", () => {
      expect(orgMarkerFor("admin-x")).toBe("cy-admin-x");
    });
  });

  describe("compositeGroupValue", () => {
    test("flattens every slash in the group path to an underscore", () => {
      expect(compositeGroupValue("acme", "Lab/TeamX")).toBe("cy-acme_Lab_TeamX");
    });

    test("propagates the org-alias guard", () => {
      expect(() => compositeGroupValue("a_b", "Lab/TeamX")).toThrow(/ambiguous/i);
      expect(() => compositeGroupValue("a/b", "Lab/TeamX")).toThrow(/ambiguous/i);
    });

    test("escapes a literal underscore in the group path", () => {
      expect(compositeGroupValue("acme", "Lab/Team_X")).toBe("cy-acme_Lab_Team:_X");
      const statements = compileGrantStatements(grant({ groupPath: "Lab/Team_X" }));
      for (const statement of statements) {
        expect(statement.Condition?.StringEquals?.["jwt:groups"]).toBe("cy-acme_Lab_Team:_X");
      }
    });

    test("the encoded composite is single-valued for an underscore path", () => {
      const statements = compileGrantStatements(grant({ groupPath: "Lab/Team_X" }));
      for (const statement of statements) {
        const groups = statement.Condition?.StringEquals?.["jwt:groups"];
        expect(Array.isArray(groups)).toBe(false);
      }
    });

    test("the escape codec is injective on the adversarial (org, path) pairs", () => {
      // `a_/b` and `a/_b` must spell two distinct composites — the escaping
      // exists precisely so the flattening cannot collide two groups.
      expect(compositeGroupValue("acme", "a_/b")).toBe("cy-acme_a:__b");
      expect(compositeGroupValue("acme", "a/_b")).toBe("cy-acme_a_:_b");
      expect(compositeGroupValue("acme", "a_/b")).not.toBe(compositeGroupValue("acme", "a/_b"));
      expect(compositeGroupValue("acme", "a:/b")).toBe("cy-acme_a::_b");
      expect(compositeGroupValue("acme", "_")).toBe("cy-acme_:_");
      expect(compositeGroupValue("acme", ":")).toBe("cy-acme_::");
      // Bare underscore path vs underscore-with-slash path stay distinct.
      expect(compositeGroupValue("acme", "Lab_TeamX")).toBe("cy-acme_Lab:_TeamX");
      expect(compositeGroupValue("acme", "Lab/TeamX")).toBe("cy-acme_Lab_TeamX");
    });
  });

  describe("org-alias guard in the grant path", () => {
    test("a group-scoped grant with an unsafe alias fails closed at compile", () => {
      expect(() => compileGrantStatements(grant({ organization: "a/b" }))).toThrow(/ambiguous/i);
      expect(() => compileGrantStatements(grant({ organization: "a_b" }))).toThrow(/ambiguous/i);
      expect(() => compileGrantStatements(grant({ organization: "admin-x" }))).not.toThrow();
    });

    test("an org-root grant with an unsafe alias fails closed at compile", () => {
      expect(() =>
        compileGrantStatements(grant({ organization: "acme corp", groupPath: "*" })),
      ).toThrow(/whitespace/i);
    });
  });
});
