// Read-only identity projection — host-independent. Carries the tenant-relevant
// subset of the host's user profile and deliberately omits raw PII (name, email,
// preferred_username, policy): the client slot path ships Identity to the
// browser on every protected navigation, and nothing in the overlay/banner needs
// PII. The host treats organizationAttributes as an opaque string map and assigns
// no meaning to its keys; the consuming plugin owns that vocabulary.

/** Read-only identity view derived from the verified token. */
export interface Identity {
  /** Active Keycloak organization alias. Undefined ⇒ zero-org session. */
  organization?: string;
  /**
   * Keycloak Organization attributes mirrored into the token, as an opaque
   * multivalued map (Keycloak attributes are arrays). A generic Keycloak
   * Organizations primitive — the host does not interpret keys and does not
   * collapse values. The consuming plugin reads its own keys out of this map
   * and narrows them to its own types; a single-valued attribute is read as
   * `[0]`. `Readonly` at the type level; the host also freezes the map and its
   * arrays at runtime.
   */
  organizationAttributes: Readonly<Record<string, readonly string[]>>;
  /** Tenant group paths the user belongs to (admin subgroups excluded). */
  groups: readonly string[];
  /** Scopes the user administers, incl. the `*` (`ORG_ROOT_SCOPE`) sentinel. */
  adminScopes: readonly string[];
}
