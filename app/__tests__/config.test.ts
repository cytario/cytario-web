import { cytarioConfig } from "~/config";

describe("session cookie", () => {
  // Shared Keycloak realm: cytario-web (app.cytario.com) and the admin portal
  // (admin.cytario.com) are distinct origins. A `Domain=.cytario.com` cookie
  // would leak the session across them. The cookie must stay host-scoped, so
  // there must be no `Domain` attribute.
  test("has no Domain attribute (host-scoped, no cross-subdomain leak)", () => {
    expect("domain" in cytarioConfig.cookie).toBe(false);
    expect((cytarioConfig.cookie as { domain?: unknown }).domain).toBeUndefined();
  });
});
