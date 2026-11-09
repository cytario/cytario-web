import { vi } from "vitest";

/**
 * vi.mock factory for `~/.server/auth/orgTokenExchange` — every consumer test
 * stubs this module the same way, so the factory lives here once. Both mints
 * (access for portal lookups, ID for STS writes) resolve for any alias and
 * return the token string, matching the public functions' contract:
 *
 * vi.mock("~/.server/auth/orgTokenExchange",
 *   async () => (await import("~/utils/__tests__/orgTokenExchangeMock")).orgTokenExchangeMocks(),
 * );
 */
export const orgTokenExchangeMocks = () => ({
  exchangePortalAccessToken: vi.fn((_sessionId: string, alias: string) =>
    Promise.resolve(`narrow-access:${alias}`),
  ),
  exchangeOrgIdToken: vi.fn((_sessionId: string, alias: string) =>
    Promise.resolve(`narrow-id:${alias}`),
  ),
});
