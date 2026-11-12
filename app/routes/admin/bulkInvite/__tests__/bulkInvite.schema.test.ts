import { describe, expect, test } from "vitest";

import { bulkInviteRowSchema, bulkInviteSchema } from "../bulkInvite.schema";

describe("bulkInviteRowSchema", () => {
  test("parses a valid row", () => {
    const result = bulkInviteRowSchema.safeParse({
      email: "user@example.com",
    });
    expect(result.success).toBe(true);
  });

  test("fails with invalid email", () => {
    const result = bulkInviteRowSchema.safeParse({
      email: "not-an-email",
    });
    expect(result.success).toBe(false);
  });

  test("fails with email exceeding 254 characters", () => {
    const result = bulkInviteRowSchema.safeParse({
      email: `${"a".repeat(250)}@b.co`,
    });
    expect(result.success).toBe(false);
  });
});

describe("bulkInviteSchema", () => {
  const validRow = { email: "user@example.com" };

  test("parses a valid payload", () => {
    const result = bulkInviteSchema.safeParse({ rows: [validRow] });
    expect(result.success).toBe(true);
  });

  test("defaults groupIds to an empty list", () => {
    const result = bulkInviteSchema.safeParse({ rows: [validRow] });
    expect(result.success && result.data.groupIds).toEqual([]);
  });

  test("parses batch-level groupIds", () => {
    const result = bulkInviteSchema.safeParse({
      rows: [validRow],
      groupIds: ["g1", "g2"],
    });
    expect(result.success && result.data.groupIds).toEqual(["g1", "g2"]);
  });

  test("fails with empty rows", () => {
    const result = bulkInviteSchema.safeParse({ rows: [] });
    expect(result.success).toBe(false);
  });

  test("fails when rows exceed maximum of 100", () => {
    const rows = Array.from({ length: 101 }, (_, i) => ({
      email: `user${i}@example.com`,
    }));
    const result = bulkInviteSchema.safeParse({ rows });
    expect(result.success).toBe(false);
  });

  test("allows exactly 100 rows", () => {
    const rows = Array.from({ length: 100 }, (_, i) => ({
      email: `user${i}@example.com`,
    }));
    const result = bulkInviteSchema.safeParse({ rows });
    expect(result.success).toBe(true);
  });
});
