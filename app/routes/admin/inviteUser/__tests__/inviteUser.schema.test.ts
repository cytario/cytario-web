import { describe, expect, test } from "vitest";

import { inviteUserSchema } from "../inviteUser.schema";

const emails = (count: number) => Array.from({ length: count }, (_, i) => `user${i}@example.com`);

describe("inviteUserSchema", () => {
  test("parses a single email and defaults groupIds to an empty list", () => {
    const result = inviteUserSchema.safeParse({ emails: ["user@example.com"] });

    expect(result.success && result.data).toEqual({ emails: ["user@example.com"], groupIds: [] });
  });

  test("parses several emails with groupIds", () => {
    const result = inviteUserSchema.safeParse({
      emails: ["a@example.com", "b@example.com"],
      groupIds: ["g1", "g2"],
    });

    expect(result.success && result.data.groupIds).toEqual(["g1", "g2"]);
    expect(result.success && result.data.emails).toHaveLength(2);
  });

  test("fails with no emails", () => {
    const result = inviteUserSchema.safeParse({ emails: [] });

    expect(result.success).toBe(false);
    expect(result.success || result.error.issues[0].message).toBe(
      "Enter at least one email address",
    );
  });

  test("fails with an invalid email", () => {
    const result = inviteUserSchema.safeParse({ emails: ["not-an-email"] });

    expect(result.success).toBe(false);
    expect(result.success || result.error.issues[0].message).toBe("Invalid email");
  });

  test("fails with an email exceeding 254 characters", () => {
    const result = inviteUserSchema.safeParse({ emails: [`${"a".repeat(250)}@b.co`] });

    expect(result.success).toBe(false);
  });

  test("allows exactly 100 emails", () => {
    expect(inviteUserSchema.safeParse({ emails: emails(100) }).success).toBe(true);
  });

  test("fails when emails exceed the maximum of 100", () => {
    const result = inviteUserSchema.safeParse({ emails: emails(101) });

    expect(result.success).toBe(false);
    expect(result.success || result.error.issues[0].message).toBe(
      "Enter at most 100 email addresses",
    );
  });
});
