import { describe, expect, test } from "vitest";

import {
  bucketNameSchema,
  connectionNameSchema,
  connectionSchema,
  prefixSchema,
  scopeSchema,
  suggestName,
} from "../connection.schema";

const validBase = {
  name: "my-bucket-data",
  providerConnectionId: "pc-1",
  bucketName: "my-bucket",
  prefix: "data",
  grants: [{ scope: "lab", providerRoleId: "pr-1" }],
};

describe("connectionNameSchema", () => {
  test("accepts valid names", () => {
    expect(connectionNameSchema.safeParse("my-bucket").success).toBe(true);
    expect(connectionNameSchema.safeParse("My Bucket").success).toBe(true);
    expect(connectionNameSchema.safeParse("data123").success).toBe(true);
  });

  test("rejects too short, too long, and consecutive separators", () => {
    expect(connectionNameSchema.safeParse("a").success).toBe(false);
    expect(connectionNameSchema.safeParse("a".repeat(61)).success).toBe(false);
    expect(connectionNameSchema.safeParse("my--bucket").success).toBe(false);
    expect(connectionNameSchema.safeParse("my  bucket").success).toBe(false);
    expect(connectionNameSchema.safeParse("my_bucket").success).toBe(false);
  });
});

describe("bucketNameSchema", () => {
  test("accepts valid bucket names", () => {
    expect(bucketNameSchema.safeParse("my-bucket").success).toBe(true);
    expect(bucketNameSchema.safeParse("data.lake.2024").success).toBe(true);
  });

  test("rejects too short / long / uppercase / bad edges", () => {
    expect(bucketNameSchema.safeParse("ab").success).toBe(false);
    expect(bucketNameSchema.safeParse("a".repeat(64)).success).toBe(false);
    expect(bucketNameSchema.safeParse("MyBucket").success).toBe(false);
    expect(bucketNameSchema.safeParse("-bucket").success).toBe(false);
  });
});

describe("prefixSchema (SRS-CY-42115)", () => {
  test("accepts a normal prefix and empty", () => {
    expect(prefixSchema.safeParse("").success).toBe(true);
    expect(prefixSchema.safeParse("lab/team-a/images").success).toBe(true);
  });

  test("rejects IAM wildcard characters", () => {
    expect(prefixSchema.safeParse("tenant-a*").success).toBe(false);
    expect(prefixSchema.safeParse("tenant-?").success).toBe(false);
  });

  test("rejects IAM policy-variable syntax", () => {
    expect(prefixSchema.safeParse("home/${aws:username}").success).toBe(false);
  });

  test("rejects path traversal segment", () => {
    expect(prefixSchema.safeParse("a/../b").success).toBe(false);
    expect(prefixSchema.safeParse("..").success).toBe(false);
  });

  test("rejects NUL / CR / LF control characters", () => {
    expect(prefixSchema.safeParse("a\0b").success).toBe(false);
    expect(prefixSchema.safeParse("a\rb").success).toBe(false);
    expect(prefixSchema.safeParse("a\nb").success).toBe(false);
  });

  test("rejects over-length prefixes", () => {
    expect(prefixSchema.safeParse("a".repeat(1025)).success).toBe(false);
  });
});

describe("scopeSchema", () => {
  test("accepts group paths, user subs, and the org-root sentinel", () => {
    expect(scopeSchema.safeParse("lab/team-a").success).toBe(true);
    expect(scopeSchema.safeParse("user-123").success).toBe(true);
    expect(scopeSchema.safeParse("*").success).toBe(true);
  });

  test("rejects traversal-looking segments", () => {
    expect(scopeSchema.safeParse("Lab/../x").success).toBe(false);
    expect(scopeSchema.safeParse("..").success).toBe(false);
  });

  test("rejects empty segments and leading/trailing slashes", () => {
    expect(scopeSchema.safeParse("lab//team").success).toBe(false);
    expect(scopeSchema.safeParse("/lab").success).toBe(false);
    expect(scopeSchema.safeParse("lab/").success).toBe(false);
  });

  test("rejects IAM wildcard / variable / control characters", () => {
    expect(scopeSchema.safeParse("lab*").success).toBe(false);
    expect(scopeSchema.safeParse("lab?").success).toBe(false);
    expect(scopeSchema.safeParse("lab${aws:username}").success).toBe(false);
    expect(scopeSchema.safeParse("lab\nops").success).toBe(false);
  });

  test("rejects empty and over-length values", () => {
    expect(scopeSchema.safeParse("").success).toBe(false);
    expect(scopeSchema.safeParse("a".repeat(256)).success).toBe(false);
  });
});

describe("suggestName", () => {
  test("derives from bucket only, and bucket + last prefix segment", () => {
    expect(suggestName("my-bucket", "")).toBe("my-bucket");
    expect(suggestName("my-bucket", "data/images")).toBe("my-bucket images");
    expect(suggestName("my-bucket", "data/")).toBe("my-bucket data");
  });

  test("sanitizes and truncates", () => {
    expect(suggestName("my_bucket.test", "")).toBe("my bucket test");
    expect(suggestName("a".repeat(70), "").length).toBeLessThanOrEqual(60);
  });
});

describe("connectionSchema (SRS-CY-32118 — FK selectors, no free text)", () => {
  test("validates a complete submission", () => {
    expect(connectionSchema.safeParse(validBase).success).toBe(true);
  });

  test("prefix defaults to empty when omitted", () => {
    const { prefix, ...withoutPrefix } = validBase;
    void prefix;
    const result = connectionSchema.safeParse(withoutPrefix);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.prefix).toBe("");
  });

  test("rejects a missing provider connection id", () => {
    const result = connectionSchema.safeParse({ ...validBase, providerConnectionId: "" });
    expect(result.success).toBe(false);
  });

  test("rejects a missing provider role id in a grant", () => {
    const result = connectionSchema.safeParse({
      ...validBase,
      grants: [{ scope: "lab", providerRoleId: "" }],
    });
    expect(result.success).toBe(false);
  });

  test("rejects an empty grants array", () => {
    const result = connectionSchema.safeParse({ ...validBase, grants: [] });
    expect(result.success).toBe(false);
  });

  test("C-347: rejects duplicate group scopes across grants", () => {
    const result = connectionSchema.safeParse({
      ...validBase,
      grants: [
        { scope: "lab", providerRoleId: "pr-1" },
        { scope: "lab", providerRoleId: "pr-2" },
      ],
    });
    expect(result.success).toBe(false);
  });

  test("C-347: accepts multiple grants with distinct scopes", () => {
    const result = connectionSchema.safeParse({
      ...validBase,
      grants: [
        { scope: "lab", providerRoleId: "pr-1" },
        { scope: "ops", providerRoleId: "pr-2" },
      ],
    });
    expect(result.success).toBe(true);
  });

  test("rejects a wildcard prefix", () => {
    const result = connectionSchema.safeParse({ ...validBase, prefix: "tenant-a*" });
    expect(result.success).toBe(false);
    const errors = result.success ? {} : result.error.flatten().fieldErrors;
    expect(errors.prefix?.[0]).toMatch(/wildcard/i);
  });

  test("rejects an invalid bucket name", () => {
    const result = connectionSchema.safeParse({ ...validBase, bucketName: "AB" });
    expect(result.success).toBe(false);
  });

  test("does not accept free-text role or endpoint fields", () => {
    const result = connectionSchema.safeParse({
      ...validBase,
      roleArn: "arn:aws:iam::123456789012:role/Evil",
      endpoint: "https://evil.example.com",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect("roleArn" in result.data).toBe(false);
      expect("endpoint" in result.data).toBe(false);
    }
  });
});
