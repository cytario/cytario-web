/**
 * A connection a plugin gate listed as visible-locked: rendered, never
 * browsable. The call-to-action fields are the gate's own copy, carried to the
 * pill verbatim — the host never learns why the connection is locked.
 */
export interface LockedConnection {
  id: string;
  message?: string;
  resolveUrl?: string;
  resolveLabel?: string;
}

/** The per-connection facts a gate consult; `isPublic` is absent when unknown. */
export interface ConnectionGateFacts {
  connectionId: string;
  isPublic?: boolean;
}
