// PII-free projection: crosses to the browser via slot props.

/** Read-only identity view derived from the verified token. */
export interface Identity {
  /** Opaque user subject (`sub` claim). Not PII — a UUID the browser already holds in the JWT. */
  sub: string;
  /** Active Keycloak organization alias. Undefined ⇒ zero-org session. */
  organization?: string;
  /**
   * Opaque, multivalued Keycloak org attributes (Keycloak attrs are arrays);
   * the host neither interprets keys nor collapses values — read `[0]` for a
   * single-valued attribute. Frozen at runtime.
   */
  organizationAttributes: Readonly<Record<string, readonly string[]>>;
  /** Tenant group paths the user belongs to (admin subgroups excluded). */
  groups: readonly string[];
  /** Scopes the user administers, incl. the `*` (`ORG_ROOT_SCOPE`) sentinel. */
  adminScopes: readonly string[];
}
