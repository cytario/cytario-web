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
    }
  // The request continues, but the named connections render visible-locked:
  // listed and deletable, never browsable. The host renders the locked
  // presentation generically — it never learns why they are locked.
  | { kind: "lock"; connectionIds: string[] };

/**
 * Host-resolved resource facts. The host states what it knows; the plugin
 * decides what it means.
 */
export interface GateRequest {
  url: string;
  method: string; // uppercase — lets a gate treat writes differently from reads
  identity: Identity; // org, attrs, groups, scopes (the plugin interprets attrs itself)
  /** Present when the request addresses a storage resource. */
  resource?: {
    /** The connection id named by a `/:org/:id/*` request; undefined otherwise. */
    connectionId?: string;
    /** Whether the connection's provider is public (credential-less, read-only),
     *  resolved from the host's provider catalog; undefined when unknown. */
    isPublic?: boolean;
  };
}

export type SessionGate = (req: GateRequest) => GateOutcome | Promise<GateOutcome>;

export interface GateRegistry {
  register(gate: SessionGate): void;
}
