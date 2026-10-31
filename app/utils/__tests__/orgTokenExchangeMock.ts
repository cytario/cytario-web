import { vi } from "vitest";

import type { ExchangedOrgToken } from "~/.server/auth/orgTokenExchange";

/**
 * The narrow per-org token an exchange returns. Even a narrow token's
 * `organization` claim stays Keycloak-shaped — a claim record with exactly
 * one alias key, never a bare string.
 */
const exchangedOrgToken = (
  alias: string,
  over: Partial<ExchangedOrgToken> = {},
): ExchangedOrgToken => ({
  accessToken: `narrow-access:${alias}`,
  expiresAt: Date.now() + 300_000,
  organization: alias,
  ...over,
});

/**
 * vi.mock factory for `~/.server/auth/orgTokenExchange` — every consumer test
 * stubs this module the same way, so the factory lives here once. Both mints
 * (access for portal lookups, ID for STS writes) resolve for any alias:
 *
 * vi.mock("~/.server/auth/orgTokenExchange",
 *   async () => (await import("~/utils/__tests__/orgTokenExchangeMock")).orgTokenExchangeMocks(),
 * );
 */
export const orgTokenExchangeMocks = () => ({
  getOrExchangeOrgAccessToken: vi.fn((_sessionId: string, alias: string) =>
    Promise.resolve(exchangedOrgToken(alias, { accessToken: `narrow-access:${alias}` })),
  ),
  getOrExchangeOrgToken: vi.fn((_sessionId: string, alias: string) =>
    Promise.resolve(exchangedOrgToken(alias, { accessToken: `narrow-id:${alias}` })),
  ),
});
