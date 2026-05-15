import { sanitizeHeaders } from "../headers";

describe("sanitizeHeaders", () => {
  test("undefined returns empty record", () => {
    expect(sanitizeHeaders(undefined)).toEqual({});
  });

  test("empty input returns empty output", () => {
    expect(sanitizeHeaders({})).toEqual({});
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

  test("denylist strips Authorization, Host, Cookie", () => {
    expect(
      sanitizeHeaders({
        Authorization: "Bearer evil",
        Host: "evil.example.com",
        Cookie: "stolen=yes",
      }),
    ).toEqual({});
  });

  test("denies any x-amz-* header (case-insensitive)", () => {
    expect(
      sanitizeHeaders({
        "x-amz-acl": "public-read",
        "X-Amz-Server-Side-Encryption": "AES256",
        "x-amz-meta-foo": "bar",
      }),
    ).toEqual({});
  });

  test("denylist takes precedence over allowlist via case-insensitive match", () => {
    expect(
      sanitizeHeaders({
        AUTHORIZATION: "Bearer evil",
        authorization: "Bearer also-evil",
      }),
    ).toEqual({});
  });

  test("unknown headers are dropped", () => {
    expect(sanitizeHeaders({ "X-Custom-Header": "value" })).toEqual({});
  });

  test("preserves original casing of allowed keys", () => {
    expect(sanitizeHeaders({ RANGE: "bytes=0-1023" })).toEqual({
      RANGE: "bytes=0-1023",
    });
  });

  describe("value guards", () => {
    test("rejects values containing NUL", () => {
      expect(sanitizeHeaders({ Range: "bytes=0-\x001023" })).toEqual({});
    });

    test("rejects values containing DEL (U+007F)", () => {
      expect(sanitizeHeaders({ Accept: "application/\x7Fjson" })).toEqual({});
    });

    test("rejects values containing newline / CR / tab (control chars)", () => {
      expect(sanitizeHeaders({ Range: "bytes=0-1023\n" })).toEqual({});
      expect(sanitizeHeaders({ Range: "bytes=0-\r1023" })).toEqual({});
      expect(sanitizeHeaders({ Range: "bytes=\t0-1023" })).toEqual({});
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
      // "€" = 3 UTF-8 bytes. 342 * 3 = 1026 > 1024.
      const value = "€".repeat(342);
      expect(sanitizeHeaders({ Accept: value })).toEqual({});
    });

    test("rejects non-string values defensively", () => {
      const headers = { Range: 1024 } as unknown as Record<string, string>;
      expect(sanitizeHeaders(headers)).toEqual({});
    });
  });
});
