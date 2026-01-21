# Authentication Module

Server-side authentication using OAuth 2.0 Authorization Code Flow with Keycloak (or compatible OIDC provider).

## Architecture Overview

```
User Request → sessionMiddleware → authMiddleware → Route Handler
                    ↓                    ↓
              Load session         Validate tokens
              from cookie          Refresh if expired
                    ↓                    ↓
                 Redis            OAuth Provider (Keycloak)
                    ↓                    ↓
              Session data        STS AssumeRoleWithWebIdentity
                                        ↓
                                  S3 Credentials
```

## Authentication Flow

### 1. Login Flow
```
User visits /login
    ↓
Generate CSRF state (stored in Redis, 10-min TTL)
    ↓
Redirect to Keycloak authorization endpoint
    ↓
User authenticates with Keycloak
    ↓
Redirect to /auth/callback with code + state
    ↓
Validate state (CSRF protection)
    ↓
Exchange code for tokens (access, refresh, id)
    ↓
Fetch user profile from userinfo endpoint
    ↓
Create session in Redis
    ↓
Set __session cookie
    ↓
Redirect to original destination
```

### 2. Protected Route Access
```
Request with __session cookie
    ↓
sessionMiddleware: Load session from Redis
    ↓
authMiddleware: Validate idToken
    ├─ Valid: Proceed
    └─ Expired: Check refreshToken
        ├─ Valid: Refresh tokens, update session
        └─ Expired: Logout, redirect to /login
    ↓
Fetch S3 credentials if needed (STS AssumeRoleWithWebIdentity)
    ↓
Route handler with validated auth context
```

### 3. Logout Flow
```
User clicks logout
    ↓
Destroy session in Redis
    ↓
Redirect to Keycloak end_session_endpoint
    ↓
Keycloak redirects to /login
```

## Files

### Core Security

| File | Purpose |
|------|---------|
| `authMiddleware.ts` | Token validation, refresh, and credential fetching |
| `sessionMiddleware.ts` | Load session from cookie into context |
| `sessionStorage.ts` | Redis-backed session storage with LRU cache |
| `oauthState.ts` | CSRF state generation and validation |

### Token Operations

| File | Purpose |
|------|---------|
| `exchangeAuthCode.ts` | OAuth authorization code → tokens |
| `refreshAuthTokens.ts` | Refresh token → new tokens |
| `getUserInfo.ts` | Fetch user profile from OIDC provider |
| `wellKnownEndpoints.ts` | OIDC endpoint discovery |

### AWS/S3 Integration

| File | Purpose |
|------|---------|
| `getSessionCredentials.ts` | STS AssumeRoleWithWebIdentity |
| `getS3Client.ts` | Create/cache S3 client with credentials |
| `getPresignedUrl.ts` | Generate presigned S3 URLs |

### Session Utilities

| File | Purpose |
|------|---------|
| `getSession.ts` | Session retrieval (deprecated - use middleware) |
| `getSessionData.ts` | Extract user, tokens, credentials from session |
| `redirectIfAuthenticated.ts` | Redirect helper for login page |

## Session Data Structure

```typescript
interface SessionData {
  user: UserProfile;        // From OIDC userinfo
  authTokens: {
    accessToken: string;    // Short-lived, for OIDC API calls
    refreshToken: string;   // Long-lived, for token renewal
    idToken: string;        // JWT for AWS STS
  };
  credentials: {            // Per-bucket S3 credentials
    [bucketName]: {
      AccessKeyId: string;
      SecretAccessKey: string;
      SessionToken: string;
      Expiration: Date;
    };
  };
  notification?: {          // Flash message
    status: 'success' | 'error';
    message: string;
  };
}
```

## Security Features

- **OAuth 2.0 Authorization Code Flow** - Credentials never touch the app
- **CSRF Protection** - State parameter with Redis storage
- **Server-side Tokens** - Tokens stored in Redis, not exposed to client
- **Automatic Token Refresh** - Transparent renewal before expiration
- **Temporary AWS Credentials** - 1-hour STS credentials via role assumption
- **Credential Isolation** - Per-user, per-bucket S3 client caching
- **HttpOnly Cookies** - Session cookie not accessible via JavaScript

## Configuration

Environment variables (via `config.ts`):

```
# OAuth Provider (Keycloak)
AUTH_BASE_URL=https://keycloak.example.com/auth/realms/cytario
AUTH_CLIENT_ID=cytario-web
AUTH_CLIENT_SECRET=secret
AUTH_SCOPES=openid profile email

# Redis/Valkey
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_USERNAME=
REDIS_PASSWORD=
```

## Usage in Routes

```typescript
import { authMiddleware, authContext } from "~/.server/auth/authMiddleware";

export const middleware = [authMiddleware];

export const loader = async ({ context }: LoaderFunctionArgs) => {
  const { user, credentials, authTokens } = context.get(authContext);
  // user is guaranteed authenticated
  // credentials contains valid S3 credentials for the bucket
};
```


