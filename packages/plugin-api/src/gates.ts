import type { Identity } from "./auth";

export type GateOutcome =
  | { kind: "continue" }
  // Navigation redirect (absolute or app-relative). Host does NOT validate the
  // URL — don't interpolate user input here (open-redirect risk).
  | { kind: "redirect"; url: string }
  // Blocks a single request without navigating — e.g. making a workspace
  // read-only by denying unsafe methods. The host returns a Response with
  // this status (default 403) and a JSON `{ error: message }` body the UI
  // surfaces as a toast. Denying a GET yields the ErrorBoundary, so gates
  // should branch on `method`. `resolveUrl` + `resolveLabel` let the UI
  // render an actionable link alongside the message.
  | {
      kind: "deny";
      status?: number;
      message?: string;
      resolveUrl?: string;
      resolveLabel?: string;
    };

export interface GateRequest {
  url: string;
  method: string; // uppercase — lets a gate treat writes differently from reads
  identity: Identity; // org, attrs, groups, scopes (the plugin interprets attrs itself)
}

export type SessionGate = (req: GateRequest) => GateOutcome | Promise<GateOutcome>;

export interface GateRegistry {
  register(gate: SessionGate): void;
}
