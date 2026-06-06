import type { Identity } from "./auth";

export type GateOutcome =
  | { kind: "continue" }
  // For navigations — e.g. no-org onboarding or a plugin-defined hard-stop.
  // Absolute or app-relative. The host does NOT validate this URL — gate
  // authors must not interpolate user-controlled input here without their own
  // validation (open-redirect risk).
  | { kind: "redirect"; url: string }
  // For blocking a single request without navigating — e.g. making a workspace
  // read-only by denying unsafe methods. Host returns a Response with
  // this status (default 403) and a JSON `{ error: message }` body the UI
  // surfaces as a toast. Intended for unsafe methods; denying a GET yields an
  // error page (the ErrorBoundary), so gates should branch on `method`.
  | { kind: "deny"; status?: number; message?: string };

export interface GateRequest {
  url: string; // request URL
  method: string; // HTTP method, uppercase — lets a gate treat writes differently from reads
  identity: Identity; // org, attrs, groups, scopes (plugin interprets the attrs itself)
}

export type SessionGate = (req: GateRequest) => GateOutcome | Promise<GateOutcome>;

export interface GateRegistry {
  register(gate: SessionGate): void;
}
