import { AsyncLocalStorage } from "node:async_hooks";

import type { UserProfile } from "./auth/getUserInfo";
import type { AuthTokens } from "./auth/sessionStorage";
import type { Identity } from "@cytario/plugin-api";

/**
 * Per-request data the host capabilities need. Set up by the request
 * pipeline (after `authMiddleware` resolves the session) and read by
 * `HostCapabilities` methods via `AsyncLocalStorage` so a plugin's
 * loader/action can call `ctx.host.connections()` without passing an
 * explicit request context (SDS-CY-010094/010097).
 *
 * Server-only: this module lives under `.server/` so it never enters the
 * client bundle.
 */
export interface HostRequestData {
  user: UserProfile;
  /**
   * Identity projection for the plugin handler. Set on the session path and
   * the `job-token` carve-out (derived from the token's claims); `undefined`
   * for org-agnostic carve-outs (`deployment-secret`, `webhook-secret`) that
   * have no caller identity to project.
   */
  identity?: Identity;
  authTokens: AuthTokens;
  sessionId: string;
}

export const hostRequestStorage = new AsyncLocalStorage<HostRequestData>();

/**
 * Wraps `fn` in an `AsyncLocalStorage` context so host capabilities can
 * resolve the active organization and session for the current request.
 * Called by the request pipeline after `authMiddleware` resolves.
 */
export function withHostRequestContext<T>(data: HostRequestData, fn: () => T): T {
  return hostRequestStorage.run(data, fn);
}
