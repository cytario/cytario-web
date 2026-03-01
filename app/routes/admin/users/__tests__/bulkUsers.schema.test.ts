import { describe, expect, test } from "vitest";

import { bulkActionSchema } from "../bulkUsers.schema";

describe("bulkActionSchema", () => {
  test("parses valid addToGroup action with groupId", () => {
    const result = bulkActionSchema.safeParse({
      intent: "addToGroup",
      userIds: "550e8400-e29b-41d4-a716-446655440000",
      groupId: "660e8400-e29b-41d4-a716-446655440001",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.intent).toBe("addToGroup");
      expect(result.data.userIds).toEqual([
        "550e8400-e29b-41d4-a716-446655440000",
      ]);
      expect(result.data.groupId).toBe(
        "660e8400-e29b-41d4-a716-446655440001",
      );
    }
  });

  test("parses multiple comma-separated userIds", () => {
    const result = bulkActionSchema.safeParse({
      intent: "enableAccounts",
      userIds:
        "550e8400-e29b-41d4-a716-446655440000,660e8400-e29b-41d4-a716-446655440001",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.userIds).toHaveLength(2);
    }
  });

  test("fails when groupId is missing for group operations", () => {
    const result = bulkActionSchema.safeParse({
      intent: "addToGroup",
      userIds: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(false);
  });

  test("succeeds without groupId for enable/disable operations", () => {
    const result = bulkActionSchema.safeParse({
      intent: "enableAccounts",
      userIds: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  test("fails with invalid intent", () => {
    const result = bulkActionSchema.safeParse({
      intent: "deleteUsers",
      userIds: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(false);
  });

  test("fails with empty userIds", () => {
    const result = bulkActionSchema.safeParse({
      intent: "enableAccounts",
      userIds: "",
    });
    expect(result.success).toBe(false);
  });

  test("fails with non-UUID userIds", () => {
    const result = bulkActionSchema.safeParse({
      intent: "enableAccounts",
      userIds: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  test("fails with non-UUID groupId", () => {
    const result = bulkActionSchema.safeParse({
      intent: "addToGroup",
      userIds: "550e8400-e29b-41d4-a716-446655440000",
      groupId: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });
});
