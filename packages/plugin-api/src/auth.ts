// Read-only identity projection handed to plugins. Omits PII (name/email/etc.)
// because it crosses to the browser via slot props. organizationAttributes is
// opaque: the host assigns no meaning to keys; the plugin owns that vocabulary.

/** Read-only identity view derived from the verified token. */
export interface Identity {
  /** Active Keycloak organization alias. Undefined ⇒ zero-org session. */
  organization?: string;
  /**
   * Opaque, multivalued Keycloak org attributes (Keycloak attrs are arrays).
   * The host neither interprets keys nor collapses values; read `[0]` for a
   * single-valued attribute. Frozen at runtime.
   */
  organizationAttributes: Readonly<Record<string, readonly string[]>>;
  /** Tenant group paths the user belongs to (admin subgroups excluded). */
  groups: readonly string[];
  /** Scopes the user administers, incl. the `*` (`ORG_ROOT_SCOPE`) sentinel. */
  adminScopes: readonly string[];
}
