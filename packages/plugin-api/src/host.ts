import type { SignedFetch } from "./format";

/**
 * Secret-free, org-prefiltered connection projection. A plugin receives this
 * projection — never the underlying `ConnectionConfig` with grants or
 * provider role references.
 */
export interface ConnectionProjection {
  id: string;
  name: string;
  /** Provider type (e.g. `"aws"`, `"minio"`). */
  provider: string;
  bucketName: string;
  prefix: string;
  endpoint?: string;
  region?: string;
}

/**
 * Secret-free projection of a connected compute provider. The host resolves
 * the provider catalog, filters to `status === "connected"`, and projects
 * only the identity and type attributes a plugin needs for visibility
 * gating — never role ARNs or `typeSpecific` internals. A plugin answers
 * "does the active org have a connected compute provider?" with
 * `computeConnections().length > 0` without an effectful probe of
 * `assumeComputeRole`.
 */
export interface ComputeConnectionProjection {
  id: string;
  name: string;
  /** Compute provider type (e.g. `"AWS_BATCH"`). */
  type: string;
  region: string;
}

/**
 * Secret-free projection of a connected, enabled app catalog. The host
 * resolves the provider catalog, filters to
 * `status === "connected" && enabled`, and strips the access-account
 * credentials. The `registryEndpoint` is the origin the plugin composes
 * `connectionFetch` URLs against — the host's SSRF guard confines egress
 * to this origin. A plugin answers "does the active org have a connected
 * catalog?" with `catalogConnections().length > 0` without an effectful
 * probe of `connectionFetch`.
 *
 * `allowedGroups` carries the catalog access-scope entitlement — the set
 * of organization group paths a user must be a member of (at least one) to
 * consume applications from this catalog, or an empty array when the
 * catalog is org-wide. It is an attribute of the catalog connection, not
 * of the registry image, and is the channel by which the compute plugin
 * learns the access scope to filter the catalog server-side. It is not a
 * secret and not a raw role identifier, so the projection does not strip
 * it.
 */
export interface CatalogConnectionProjection {
  id: string;
  name: string;
  registryEndpoint: string;
  namespace: string;
  allowedGroups: readonly string[];
}

/**
 * Extends the `signedFetch` contract to a non-S3 upstream the host holds a
 * credential for (the catalog registry). The host resolves the named
 * connection, decrypts its secret in request-scoped memory, attaches the
 * authorization, issues the request, and strips the authorization from the
 * response, so the plugin composes registry requests but never receives or
 * retains the credential. Egress is confined to the connection's registry
 * origin.
 */
export type ConnectionFetch = (
  connectionName: string,
  url: string,
  init?: RequestInit,
) => Promise<Response>;

/**
 * A single object listed from a connection's prefix. The `key` is relative
 * to the connection's prefix — the host strips the prefix before returning,
 * so the plugin never sees the full S3 key.
 */
export interface StorageEntry {
  /** Object key relative to the connection's prefix (no leading slash). */
  key: string;
  /** Object size in bytes. */
  size: number;
}

/**
 * Persists plugin-supplied bytes to a user-specified connection + prefix
 * within the active organization's connected storage via the host signed-
 * write path. The `connectionId` selects a connection the user is
 * authorized to see; the `key` is relative to that connection's prefix.
 * The host validates the connection's write level permits general write at
 * that prefix and mints a server-side STS session scoped to the
 * connection's bucket/prefix — the plugin never sees the bucket name or
 * the S3 credentials. Read/write access is governed by the connection
 * authorization at the chosen location.
 */
export interface ObjectStore {
  put(connectionId: string, key: string, body: BodyInit): Promise<void>;
  get(connectionId: string, key: string): Promise<Response>;
  delete(connectionId: string, key: string): Promise<void>;
  /**
   * Lists objects under a connection's prefix. The `prefix` is relative to
   * the connection's own prefix — the host prepends the connection prefix
   * so the plugin cannot list outside the connection's scope. Returns
   * entries with keys relative to the connection's prefix. Requires read
   * access (no write-level check).
   */
  list(connectionId: string, prefix: string): Promise<readonly StorageEntry[]>;
  /**
   * Returns the size in bytes of a single object at `key` (relative to the
   * connection's prefix), or `null` when the object does not exist, its
   * size cannot be determined, or the key is a directory/prefix rather than
   * a single object — the caller then falls back to a fixed floor instead
   * of scaling by actual size. Requires read access (no write-level check).
   */
  size(connectionId: string, key: string): Promise<number | null>;
}

/**
 * Provider-neutral compute-resource envelope expressed in Kubernetes-style
 * quantities. Memory and ephemeral storage use binary suffixes (`Gi`, `Mi`,
 * …); a bare integer is bytes. CPU uses millicores (`2000m`) or whole cores
 * (`2`). GPU is an integer count. `runtimeCapSeconds` is the runtime cap in
 * seconds. The host populates this for both the provider's defaults and its
 * maximums from the compute-provider record, so the plugin's resource
 * computation needs no provider-specific control-plane call. Omitted fields
 * on the `defaults` envelope mean "no provider default"; omitted fields on
 * the `maximums` envelope mean "no known ceiling" (the pre-submit
 * satisfiability check then cannot reject on that resource — acceptable
 * for a self-hosted deployment whose compute environment is unbounded,
 * never acceptable for a managed Fargate queue where the fixed
 * VCPU/MEMORY pair set must be honored).
 */
export interface ProviderResourceEnvelope {
  cpu?: string;
  memory?: string;
  ephemeralStorage?: string;
  gpu?: number;
  runtimeCapSeconds?: number;
  /**
   * Platform the compute environment runs on. Drives which knobs the
   * binding applies: `EC2` honors `resourceRequirements` (VCPU/MEMORY/GPU)
   * and `instanceType` is invalid for single-node jobs; `FARGATE` honors
   * the fixed VCPU/MEMORY pair set in `supportedVcpuMemoryPairs` and
   * rejects `gpu > 0`; a future `KUBERNETES` binding maps the envelope onto
   * `resources.requests`/`limits`. Absent on a `defaults` envelope that
   * predates this surface (the binding then assumes EC2).
   */
  platform?: "EC2" | "FARGATE";
  /**
   * Fargate-only: the discrete (VCPU, MEMORY) pairs the queue accepts,
   * as Kubernetes-style quantities (e.g. `["2", "8Gi"]`). An empty or
   * absent list means no Fargate constraint is enforced. EC2 envelopes
   * omit it.
   */
  supportedVcpuMemoryPairs?: readonly [string, string][];
}

/**
 * Credential-bearing signed request surface for the submit role's
 * control-plane calls and the broker's storage mint — never raw keys. The
 * plugin uses `signedFetch` to make authenticated requests; the host mints
 * the STS session and the plugin never sees an access key or a raw session
 * token.
 */
export interface ComputeRoleSession {
  signedFetch: SignedFetch;
  /** ARN of the AWS Batch job queue registered on the compute provider. */
  jobQueueArn: string;
  /**
   * ARN of the compute provider's job role — the running container's
   * identity, carrying no standing storage access. The plugin uses it to
   * construct the provider job-definition on demand — never a
   * caller-supplied role.
   */
  jobRoleArn: string;
  /**
   * ARN of the compute provider's execution role — limited to image pull and
   * log write. Used to construct the provider job-definition on demand.
   */
  executionRoleArn: string;
  /**
   * ARN of the Secrets Manager pull-secret reference, or null when the
   * provider has no connected app catalog. Embedded in the on-demand job
   * definition so AWS Batch retrieves the registry credential at
   * image-fetch time.
   */
  imagePullSecretRef: string | null;
  /**
   * CloudWatch Logs log-group name the compute provider's job-container output
   * is written to. Provisioned by the admin-portal via the Logs
   * `CreateLogGroup` API and passed through the lookup so the plugin references
   * it in the on-demand job definition's `logConfiguration` — never hard-coded.
   */
  logGroupName: string;
  /**
   * The compute provider's default resource envelope for the active
   * organization, projected from the compute-provider record. The
   * plugin's resource computation takes the maximum of the app floor, this
   * default, and the caller override. Optional — a host implementation
   * predating this surface omits it, and the plugin computes from the app
   * floor and caller override alone.
   */
  defaultResources?: ProviderResourceEnvelope;
  /**
   * The compute provider's maximum resource envelope for the active
   * organization — the satisfiability ceiling the compute environment can
   * place. The plugin rejects, before any job is submitted, a target whose
   * effective memory, ephemeral storage, or GPU request exceeds this
   * envelope. Optional — a host that cannot determine the ceiling omits it,
   * and the plugin skips the satisfiability check for that resource
   * (acceptable only when the environment is genuinely unbounded; a managed
   * Fargate queue must populate `supportedVcpuMemoryPairs`).
   */
  maxResources?: ProviderResourceEnvelope;
}

/**
 * Offline-capable job token grant. The token can be passed to a submitted
 * job so it can call the credential-broker endpoint to obtain short-lived
 * storage credentials without a browser session.
 */
export interface TokenGrant {
  token: string;
  expiresAt: Date;
  /**
   * The offline-session identifier from the token exchange. Recorded in the
   * running-jobs ledger so the reconciler can revoke the grant after the job
   * completes.
   */
  offlineSessionId: string;
}

/**
 * Identifier-only record in the host-owned running-jobs ledger. Never
 * carries token or credential material. A row is created at submission and
 * removed only after its grant's revocation is confirmed.
 */
export interface JobRecord {
  jobId: string;
  batchId: string;
  offlineSessionId: string;
  /**
   * The compute provider the job was submitted to. Host-injected on `record`
   * and validated against the active organization's connected providers;
   * absent means the org's first connected provider.
   */
  providerId?: string | null;
  /**
   * The organization this job belongs to. Host-injected on `record` (the
   * caller-supplied value is discarded and the active session org is used);
   * populated from the ledger row on `lookup`.
   */
  organization: string;
  owner: string;
  /**
   * The validated input S3 URIs the analysis reads (`s3://bucket/prefix`).
   * Server-constructed from the org's connected storage at submission; the
   * broker uses them to scope the session policy's read access. Empty for
   * output-only jobs.
   */
  inputS3Uris: string[];
  /**
   * The validated output S3 URI the analysis writes to (`s3://bucket/prefix`).
   * Server-constructed from the org's connected storage at submission;
   * the broker uses it to scope the session policy's write access.
   */
  outputS3Uri: string;
  /**
   * The storage connection the output target was resolved from. Plugin-supplied;
   * the host uses it at `record` time to resolve the storage role.
   */
  connectionId: string;
  /**
   * The resolved storage role ARN for the output connection. Host-injected at
   * `record` time from the submitting user's session and the connection's
   * provider role; the broker uses it for `AssumeRoleWithWebIdentity` without
   * re-resolving the provider catalog.
   */
  roleArn: string;
  /**
   * The AWS region of the storage role. Host-injected at `record` time; the
   * broker uses it for the STS endpoint and the KMS `ViaService` condition.
   */
  region: string;
  /**
   * The S3 endpoint of the storage connection (null for AWS S3). Host-injected
   * at `record` time; the broker uses it for the STS endpoint derivation.
   */
  s3Endpoint: string | null;
}

/**
 * Capability over the host-owned running-jobs ledger. Carries identifiers
 * only, never token material, with the host applying the same tenant
 * pre-filter as the connection store.
 */
export interface JobLedger {
  record(job: JobRecord): Promise<void>;
  lookup(jobId: string): Promise<JobRecord | null>;
  /**
   * Lists all ledger rows for the active organization (tenant pre-filter).
   * Returned in insertion order (oldest first). A plugin uses this to render
   * the running-jobs view.
   */
  list(): Promise<readonly JobRecord[]>;
  /**
   * Lists all ledger rows across every organization — the cross-tenant
   * scan the scheduled reconciler needs. Returned in insertion order
   * (oldest first). Only the deployment-secret carve-out (reconciler)
   * reaches this path; a session-authenticated caller must use {@link list}
   * so the tenant pre-filter holds.
   */
  listAll(): Promise<readonly JobRecord[]>;
  remove(jobId: string): Promise<void>;
}

/**
 * Server-side host capabilities surfaced through `ctx.host` on
 * `PluginContext`. The host wires `ctx.host` into `PluginContext` only when
 * `ctx.env === "server"`; on the client entry the capabilities are a no-op
 * sink that throws when called, since there is no server request context.
 *
 * Each method resolves the active organization and session from the current
 * request context internally — a plugin calls `ctx.host.connections()` and
 * receives org-prefiltered projections without passing an explicit request
 * context. The host sets up the per-request context before any plugin
 * loader/action runs.
 */
export interface HostCapabilities {
  /** Returns org-prefiltered, secret-free connection projections for the active organization. */
  connections(): Promise<readonly ConnectionProjection[]>;
  /**
   * Returns org-prefiltered, secret-free projections of connected compute
   * providers for the active organization. Only providers with
   * `status === "connected"` are included. Lets a plugin gate visibility
   * data-drivenly without an effectful probe of `assumeComputeRole`.
   */
  computeConnections(): Promise<readonly ComputeConnectionProjection[]>;
  /**
   * Returns org-prefiltered, secret-free projections of connected, enabled
   * app catalogs for the active organization. Only catalogs with
   * `status === "connected" && enabled` are included. Lets a plugin gate
   * visibility data-drivenly without an effectful probe of
   * `connectionFetch`.
   */
  catalogConnections(): Promise<readonly CatalogConnectionProjection[]>;
  /**
   * Signed fetch for a non-S3 upstream the host holds a credential for. The
   * host resolves the named connection, attaches auth, and strips it from
   * the response.
   */
  connectionFetch(connectionName: string, url: string, init?: RequestInit): Promise<Response>;
  /**
   * Returns an `ObjectStore` instance for writing plugin-supplied bytes to a
   * user-specified connection + prefix. The host validates the connection's
   * write level and mints a server-side STS session.
   */
  objectStore(): ObjectStore;
  /**
   * Returns a credential-bearing signed request surface for the compute
   * submit role. Never raw keys.
   *
   * @param providerId - when supplied, resolves that specific connected
   *   provider of the organization (the id from `ComputeConnectionProjection`).
   *   When omitted, the host resolves the organization's first connected
   *   provider.
   * @param organization - when omitted, the active organization is resolved
   *   from the request context (the session path, or the job-token carve-out
   *   whose context carries the token's org claim). When provided, the host
   *   mints for that organization — used by the cross-org reconciler, which
   *   groups ledger rows by organization and mints per org.
   */
  assumeComputeRole(providerId?: string, organization?: string): Promise<ComputeRoleSession>;
  /**
   * Performs the offline-capable job token grant.
   */
  exchangeToken(): Promise<TokenGrant>;
  /** Externally-reachable base URL of the host's broker route, for callers outside the browser origin. */
  brokerPublicUrl(): string;
  /**
   * Revokes an offline grant at the identity service. Called by the
   * reconciler after a job reaches a terminal state. The plugin passes the
   * `offlineSessionId` (from `TokenGrant.offlineSessionId`, recorded in the
   * ledger at submission) — never the raw token. The host performs the
   * revocation via the Keycloak admin session-revocation endpoint.
   * Server-only.
   */
  revokeGrant(offlineSessionId: string): Promise<void>;
  /**
   * Refreshes the canonical grant token for a live offline session ahead of
   * expiry. The plugin passes only the `offlineSessionId` — never token
   * material. Never throws; an absent or revoked session is a warn-level
   * no-op, so a revoked grant is never resurrected.
   */
  keepAliveGrant(offlineSessionId: string): Promise<void>;
  /** Returns a `JobLedger` instance scoped to the active organization. */
  jobLedger(): JobLedger;
}
