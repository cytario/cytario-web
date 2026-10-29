# Server-side auth

OAuth 2.0 Authorization Code Flow against Keycloak. Session cookies are httpOnly, secure, SameSite=Lax; session data lives in Redis/Valkey. The login scope `organization:*` resolves every membership onto the token's multi-key `organization` claim; the session's `activeOrganization` picks the tenant, and STS `AssumeRoleWithWebIdentity` mints per-connection S3 credentials from a token exchanged down to that single org.

| Module                         | Responsibility                                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `sessionMiddleware.ts`         | Resolve session cookie → session store entry.                                                                      |
| `authMiddleware.ts`            | Refresh tokens if needed; resolve the session's active org; populate `authContext` for downstream loaders.         |
| `getSessionCredentials.ts`     | Mint STS credentials per connection, from the active org's exchanged token.                                        |
| `orgTokenExchange.ts`          | RFC 8693 exchange of the multi-org session token for one org's token; in-process cache.                            |
| `orgPreference.server.ts`      | The user's last-used org, so the next login lands back there.                                                      |
| `activeOrganization.server.ts` | Switch the session to another membership and persist it as the last-used org.                                      |
| `verifyIdToken.ts`             | JWKS-based idToken signature/expiry verification.                                                                  |
| `jobCredentialStore.ts`        | The batch's held broker credentials, encrypted at rest; the broker, keep-alive and revocation all address it here. |
| `resolveJobBinding.ts`         | Resolve a job session token to the ledger row it was issued for.                                                   |
| `keycloakAdmin/`               | Service-account-backed admin API for user/group management.                                                        |
