import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  CONNECTIONS_API_SECRET_HEADER,
  connectionsApiSecretMatches,
  requireConnectionsApiSecret,
} from "../connectionsApiAuth.server";

beforeEach(() => {
  vi.unstubAllEnvs();
  delete process.env.CONNECTIONS_API_SECRET;
});

describe("connectionsApiSecretMatches", () => {
  test("accepts the correct secret", () => {
    process.env.CONNECTIONS_API_SECRET = "super-secret";
    expect(connectionsApiSecretMatches("super-secret")).toBe(true);
  });

  test("rejects a wrong secret", () => {
    process.env.CONNECTIONS_API_SECRET = "super-secret";
    expect(connectionsApiSecretMatches("wrong-secret")).toBe(false);
  });

  test("rejects a missing header", () => {
    process.env.CONNECTIONS_API_SECRET = "super-secret";
    expect(connectionsApiSecretMatches(null)).toBe(false);
  });

  test("rejects an empty header", () => {
    process.env.CONNECTIONS_API_SECRET = "super-secret";
    expect(connectionsApiSecretMatches("")).toBe(false);
  });

  test("SECURITY: fails closed when the secret is unset (no open endpoint)", () => {
    expect(connectionsApiSecretMatches("anything")).toBe(false);
    expect(connectionsApiSecretMatches("")).toBe(false);
    expect(connectionsApiSecretMatches(null)).toBe(false);
  });

  test("SECURITY: fails closed when the secret is configured empty", () => {
    process.env.CONNECTIONS_API_SECRET = "";
    expect(connectionsApiSecretMatches("")).toBe(false);
    expect(connectionsApiSecretMatches(null)).toBe(false);
  });
});

describe("requireConnectionsApiSecret", () => {
  const request = (headers: Record<string, string> = {}) =>
    new Request("http://localhost/api/connections", { headers });

  test("passes through when the secret matches", () => {
    process.env.CONNECTIONS_API_SECRET = "super-secret";
    expect(
      requireConnectionsApiSecret(request({ [CONNECTIONS_API_SECRET_HEADER]: "super-secret" })),
    ).toBeNull();
  });

  test("returns 401 JSON when the header is missing", () => {
    process.env.CONNECTIONS_API_SECRET = "super-secret";
    const response = requireConnectionsApiSecret(request())!;
    expect(response).not.toBeNull();
    expect(response.status).toBe(401);
    expect(response.headers.get("Content-Type")).toContain("application/json");
  });

  test("returns 401 when the secret is wrong", () => {
    process.env.CONNECTIONS_API_SECRET = "super-secret";
    const response = requireConnectionsApiSecret(
      request({ [CONNECTIONS_API_SECRET_HEADER]: "nope" }),
    )!;
    expect(response.status).toBe(401);
  });

  test("SECURITY: returns 401 for any request when the secret is unset", () => {
    const response = requireConnectionsApiSecret(
      request({ [CONNECTIONS_API_SECRET_HEADER]: "super-secret" }),
    )!;
    expect(response.status).toBe(401);
  });

  test("the 401 message never echoes the configured secret", async () => {
    process.env.CONNECTIONS_API_SECRET = "super-secret";
    const response = requireConnectionsApiSecret(
      request({ [CONNECTIONS_API_SECRET_HEADER]: "wrong-guess" }),
    )!;
    const body = await response.json();
    expect(JSON.stringify(body)).not.toContain("super-secret");
  });
});
