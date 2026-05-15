import { sanitizeHeaders } from "~/utils/sanitizeHeaders";

describe("host-internal sanitizeHeaders", () => {
  test("undefined returns empty record", () => {
    expect(sanitizeHeaders(undefined)).toEqual({});
  });

  test("allowlist passes Range, If-None-Match, Accept, Cache-Control", () => {
    expect(
      sanitizeHeaders({
        Range: "bytes=0-1023",
        "If-None-Match": "abc",
        Accept: "application/json",
        "Cache-Control": "no-store",
      }),
    ).toEqual({
      Range: "bytes=0-1023",
      "If-None-Match": "abc",
      Accept: "application/json",
      "Cache-Control": "no-store",
    });
  });

  test("denylist strips Authorization, Host, Cookie, x-amz-*", () => {
    expect(
      sanitizeHeaders({
        Authorization: "Bearer evil",
        Host: "evil.example.com",
        Cookie: "stolen=yes",
        "x-amz-acl": "public-read",
      }),
    ).toEqual({});
  });

  test("rejects values containing ASCII control characters", () => {
    expect(sanitizeHeaders({ Range: "bytes=0-\x001023" })).toEqual({});
    expect(sanitizeHeaders({ Accept: "json\x7Fbad" })).toEqual({});
    expect(sanitizeHeaders({ Range: "bytes=0-1023\n" })).toEqual({});
  });

  test("accepts a value at exactly 1024 UTF-8 bytes", () => {
    const value = "a".repeat(1024);
    expect(sanitizeHeaders({ Accept: value })).toEqual({ Accept: value });
  });

  test("rejects a value of 1025 UTF-8 bytes", () => {
    const value = "a".repeat(1025);
    expect(sanitizeHeaders({ Accept: value })).toEqual({});
  });

  test("counts bytes not characters (multi-byte UTF-8)", () => {
    const value = "€".repeat(342);
    expect(sanitizeHeaders({ Accept: value })).toEqual({});
  });

  test("rejects non-string values defensively", () => {
    const headers = { Range: 1024 } as unknown as Record<string, string>;
    expect(sanitizeHeaders(headers)).toEqual({});
  });
});
