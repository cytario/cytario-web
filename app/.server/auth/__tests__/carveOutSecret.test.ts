import { afterEach, describe, expect, test } from "vitest";

import {
  carveOutSecretEnvName,
  constantTimeSecretMatch,
  readBearerCredential,
  verifyCarveOutSecret,
} from "../carveOutSecret";

const requestWithCredential = (credential: string | null): Request =>
  new Request("http://localhost/api/plugin/reconcile", {
    method: "POST",
    headers: credential === null ? undefined : { Authorization: `Bearer ${credential}` },
  });

afterEach(() => {
  delete process.env.RECONCILE_SECRET;
  delete process.env.PLUGIN_WEBHOOK_SECRET;
});

describe("constantTimeSecretMatch", () => {
  test("matches equal non-empty secrets", () => {
    expect(constantTimeSecretMatch("s3cret", "s3cret")).toBe(true);
  });

  test("rejects unequal secrets regardless of length", () => {
    expect(constantTimeSecretMatch("short", "a-much-longer-configured-secret")).toBe(false);
    expect(constantTimeSecretMatch("same-length-but-wrong", "same-length-but-rong")).toBe(false);
  });

  test("fails closed on empty or missing operands", () => {
    expect(constantTimeSecretMatch("", "")).toBe(false);
    expect(constantTimeSecretMatch("s3cret", "")).toBe(false);
    expect(constantTimeSecretMatch("", "s3cret")).toBe(false);
    expect(constantTimeSecretMatch(null, "s3cret")).toBe(false);
    expect(constantTimeSecretMatch(undefined, undefined)).toBe(false);
  });
});

describe("readBearerCredential", () => {
  test("reads the bearer credential from the Authorization header", () => {
    expect(requestWithCredential("abc").headers.get("Authorization")).toBe("Bearer abc");
    expect(readBearerCredential(requestWithCredential("abc"))).toBe("abc");
  });

  test("returns null when the header is absent", () => {
    expect(readBearerCredential(requestWithCredential(null))).toBeNull();
  });

  test("returns null for a malformed header", () => {
    const request = new Request("http://localhost", {
      headers: { Authorization: "Basic abc" },
    });
    expect(readBearerCredential(request)).toBeNull();
  });
});

describe("verifyCarveOutSecret", () => {
  test("accepts the matching secret for the auth mode's env var", () => {
    process.env.RECONCILE_SECRET = "reconcile-secret-value";
    expect(
      verifyCarveOutSecret(requestWithCredential("reconcile-secret-value"), "deployment-secret"),
    ).toBe(true);
  });

  test("rejects a wrong secret", () => {
    process.env.RECONCILE_SECRET = "reconcile-secret-value";
    expect(verifyCarveOutSecret(requestWithCredential("other"), "deployment-secret")).toBe(false);
  });

  test("rejects a missing credential", () => {
    process.env.RECONCILE_SECRET = "reconcile-secret-value";
    expect(verifyCarveOutSecret(requestWithCredential(null), "deployment-secret")).toBe(false);
  });

  test("fails closed when the env var is absent or empty", () => {
    delete process.env.RECONCILE_SECRET;
    expect(verifyCarveOutSecret(requestWithCredential("anything"), "deployment-secret")).toBe(
      false,
    );
    process.env.RECONCILE_SECRET = "";
    expect(verifyCarveOutSecret(requestWithCredential("anything"), "deployment-secret")).toBe(
      false,
    );
    process.env.RECONCILE_SECRET = "set";
    process.env.PLUGIN_WEBHOOK_SECRET = "";
    expect(verifyCarveOutSecret(requestWithCredential("anything"), "webhook-secret")).toBe(false);
  });

  test("webhook-secret checks its own env var, not the reconcile one", () => {
    process.env.RECONCILE_SECRET = "reconcile-secret-value";
    process.env.PLUGIN_WEBHOOK_SECRET = "webhook-secret-value";
    expect(
      verifyCarveOutSecret(requestWithCredential("reconcile-secret-value"), "webhook-secret"),
    ).toBe(false);
    expect(
      verifyCarveOutSecret(requestWithCredential("webhook-secret-value"), "webhook-secret"),
    ).toBe(true);
  });
});

describe("carveOutSecretEnvName", () => {
  test("maps each secret auth mode to its env var", () => {
    expect(carveOutSecretEnvName("deployment-secret")).toBe("RECONCILE_SECRET");
    expect(carveOutSecretEnvName("webhook-secret")).toBe("PLUGIN_WEBHOOK_SECRET");
    expect(carveOutSecretEnvName("session")).toBeUndefined();
  });
});
