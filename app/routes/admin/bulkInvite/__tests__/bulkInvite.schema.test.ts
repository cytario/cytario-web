import { describe, expect, test } from "vitest";

import { bulkInviteRowSchema, bulkInviteSchema } from "../bulkInvite.schema";

describe("bulkInviteRowSchema", () => {
  test("parses valid row", () => {
    const result = bulkInviteRowSchema.safeParse({
      email: "user@example.com",
      firstName: "John",
      lastName: "Doe",
    });
    expect(result.success).toBe(true);
  });

  test("fails with invalid email", () => {
    const result = bulkInviteRowSchema.safeParse({
      email: "not-an-email",
      firstName: "John",
      lastName: "Doe",
    });
    expect(result.success).toBe(false);
  });

  test("fails with empty firstName", () => {
    const result = bulkInviteRowSchema.safeParse({
      email: "user@example.com",
      firstName: "",
      lastName: "Doe",
    });
    expect(result.success).toBe(false);
  });

  test("fails with email exceeding 254 characters", () => {
    const result = bulkInviteRowSchema.safeParse({
      email: `${"a".repeat(250)}@b.co`,
      firstName: "John",
      lastName: "Doe",
    });
    expect(result.success).toBe(false);
  });
});

describe("bulkInviteSchema", () => {
  const validRow = {
    email: "user@example.com",
    firstName: "John",
    lastName: "Doe",
  };

  test("parses valid payload", () => {
    const result = bulkInviteSchema.safeParse({
      groupPath: "cytario/lab",
      enabled: true,
      rows: [validRow],
    });
    expect(result.success).toBe(true);
  });

  test("fails with empty rows", () => {
    const result = bulkInviteSchema.safeParse({
      groupPath: "cytario/lab",
      enabled: true,
      rows: [],
    });
    expect(result.success).toBe(false);
  });

  test("fails when rows exceed maximum of 100", () => {
    const rows = Array.from({ length: 101 }, (_, i) => ({
      email: `user${i}@example.com`,
      firstName: "John",
      lastName: "Doe",
    }));
    const result = bulkInviteSchema.safeParse({
      groupPath: "cytario/lab",
      enabled: true,
      rows,
    });
    expect(result.success).toBe(false);
  });

  test("allows exactly 100 rows", () => {
    const rows = Array.from({ length: 100 }, (_, i) => ({
      email: `user${i}@example.com`,
      firstName: "John",
      lastName: "Doe",
    }));
    const result = bulkInviteSchema.safeParse({
      groupPath: "cytario/lab",
      enabled: true,
      rows,
    });
    expect(result.success).toBe(true);
  });

  test("fails with empty groupPath", () => {
    const result = bulkInviteSchema.safeParse({
      groupPath: "",
      enabled: true,
      rows: [validRow],
    });
    expect(result.success).toBe(false);
  });

  test("fails with non-boolean enabled", () => {
    const result = bulkInviteSchema.safeParse({
      groupPath: "cytario/lab",
      enabled: "yes",
      rows: [validRow],
    });
    expect(result.success).toBe(false);
  });
});
