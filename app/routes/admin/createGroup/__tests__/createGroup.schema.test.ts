import { describe, expect, test } from "vitest";

import { createGroupSchema } from "../createGroup.schema";

describe("createGroupSchema", () => {
  test("parses valid name", () => {
    const result = createGroupSchema.safeParse({ name: "Ultivue" });
    expect(result.success).toBe(true);
    expect(result.data!.name).toBe("Ultivue");
  });

  test("parses name with spaces", () => {
    const result = createGroupSchema.safeParse({ name: "Lab Services" });
    expect(result.success).toBe(true);
    expect(result.data!.name).toBe("Lab Services");
  });

  test("parses name with special characters", () => {
    const result = createGroupSchema.safeParse({ name: "Project #34a-C" });
    expect(result.success).toBe(true);
    expect(result.data!.name).toBe("Project #34a-C");
  });

  test("trims whitespace", () => {
    const result = createGroupSchema.safeParse({ name: "  Ultivue  " });
    expect(result.success).toBe(true);
    expect(result.data!.name).toBe("Ultivue");
  });

  test("fails with empty name", () => {
    const result = createGroupSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });

  test("fails with slashes", () => {
    const result = createGroupSchema.safeParse({ name: "team/alpha" });
    expect(result.success).toBe(false);
  });

  test("fails when exceeding 255 characters", () => {
    const result = createGroupSchema.safeParse({ name: "a".repeat(256) });
    expect(result.success).toBe(false);
  });

  test("allows exactly 255 characters", () => {
    const result = createGroupSchema.safeParse({ name: "a".repeat(255) });
    expect(result.success).toBe(true);
  });
});
