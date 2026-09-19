import { AsyncLocalStorage } from "node:async_hooks";

import type { UserProfile } from "./auth/getUserInfo";
import type { AuthTokens } from "./auth/sessionStorage";
import type { Identity, TokenGrant } from "@cytario/plugin-api";

export interface HostRequestData {
  user: UserProfile;
  // Undefined for org-agnostic carve-outs (deployment-secret, webhook-secret)
  // that have no caller identity to project.
  identity?: Identity;
  authTokens: AuthTokens;
  sessionId: string;
  // When set, ctx.host.exchangeToken() returns this grant instead of performing
  // a token exchange; only present during the job-grant callback phase.
  jobGrant?: TokenGrant;
}

export const hostRequestStorage = new AsyncLocalStorage<HostRequestData>();

export function withHostRequestContext<T>(data: HostRequestData, fn: () => T): T {
  return hostRequestStorage.run(data, fn);
}
