# Server-side auth

OAuth 2.0 Authorization Code Flow against Keycloak. Session cookies are httpOnly, secure, SameSite=Lax; session data lives in Redis/Valkey. STS `AssumeRoleWithWebIdentity` mints per-connection S3 credentials using the user's Keycloak idToken.

| Module                     | Responsibility                                                           |
| -------------------------- | ------------------------------------------------------------------------ |
| `sessionMiddleware.ts`     | Resolve session cookie → session store entry.                            |
| `authMiddleware.ts`        | Refresh tokens if needed; populate `authContext` for downstream loaders. |
| `getSessionCredentials.ts` | Mint STS credentials per connection.                                     |
| `verifyIdToken.ts`         | JWKS-based idToken signature/expiry verification.                        |
| `keycloakAdmin/`           | Service-account-backed admin API for user/group management.              |
