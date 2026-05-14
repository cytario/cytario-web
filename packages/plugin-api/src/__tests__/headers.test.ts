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
});
