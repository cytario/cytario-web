import { describe, expect, test } from "vitest";

import { GlobalSearch } from "~/components/GlobalSearch/index";

describe("GlobalSearch index", () => {
  test("should export GlobalSearch component", () => {
    expect(GlobalSearch).toBeDefined();
    expect(typeof GlobalSearch).toBe("function");
  });
});