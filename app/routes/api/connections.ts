import { type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";

import { findOrganizationByAlias } from "~/.server/auth/keycloakAdmin";
import { requireConnectionsApiSecret } from "~/.server/connections/connectionsApiAuth.server";
import { listConnectionsForOrganization } from "~/.server/connections/connectionsApiList.server";
import {
  EXTERNAL_BUCKET_POLICY_STATUS,
  createConnectionWithCatalogValidation,
} from "~/.server/connections/createConnection.server";
import { jsonError } from "~/.server/httpResponse";
import { createLabel } from "~/.server/logging";
import { serviceConnectionSchema } from "~/routes/connections/connection.schema";

const label = createLabel("connections-api", "cyan");

/**
 * Deployment-declared platform-managed buckets: the only
 * buckets whose connections may be created with `managedExternally`. Comma-
 * separated in CONNECTIONS_API_MANAGED_BUCKETS; unset disables the managed
 * path entirely (every managedExternally create is rejected).
 */
const managedBucketAllowlist = (): string[] =>
  (process.env.CONNECTIONS_API_MANAGED_BUCKETS ?? "")
    .split(",")
    .map((b) => b.trim())
    .filter(Boolean);

/**
 * Sentinel `createdBy` for service-created connections. `createdBy` is
 * a plain string column carrying the creating user's Keycloak `sub` today —
 * no FK — so the sentinel is safe, and the connections grid shows it as the
 * creator name without breaking anything.
 */
const SERVICE_CREATED_BY = "admin-portal";

/**
 * The safe projection of a connection row for a service caller: identifiers
 * and org-tenant fields only — no role ARNs, endpoints, or catalog metadata.
 */
function toServiceConnection(connection: {
  id: string;
  name: string;
  organization: string;
  createdBy: string;
  bucketName: string;
  providerConnectionId: string;
  prefix: string;
  bucketPolicyStatus: string;
  grants: Array<{ scope: string; accessLevel: string }>;
}) {
  return {
    id: connection.id,
    name: connection.name,
    organization: connection.organization,
    createdBy: connection.createdBy,
    bucketName: connection.bucketName,
    providerConnectionId: connection.providerConnectionId,
    prefix: connection.prefix,
    bucketPolicyStatus: connection.bucketPolicyStatus,
    grants: connection.grants.map((g) => ({ scope: g.scope, accessLevel: g.accessLevel })),
  };
}

/**
 * `GET /api/connections?org=<alias>` — list an organization's connections.
 * The organization alias comes from the query string; the caller is a trusted
 * service presenting the deployment's shared secret, not a browser session,
 * so there is no session-user visibility filter (the admin portal is the
 * org's onboarding service and legitimately sees every connection).
 */
export async function loader(args: LoaderFunctionArgs): Promise<Response> {
  const unauthorized = requireConnectionsApiSecret(args.request);
  if (unauthorized) return unauthorized;

  const org = new URL(args.request.url).searchParams.get("org");
  if (!org) {
    return jsonError(400, "Query parameter `org` is required");
  }

  const connections = await listConnectionsForOrganization(org);
  return Response.json(
    { connections: connections.map(toServiceConnection) },
    { headers: { "Content-Type": "application/json" } },
  );
}

/**
 * Service-to-service create: `POST /api/connections`. The admin portal
 * calls this during onboarding to create an org's DEMO connection. The
 * organization comes from the payload — the caller is a trusted service, not
 * a session.
 *
 * Idempotency: the portal retries creates after network failures, so an
 * existing (organization, providerConnectionId, bucketName, prefix) tuple is
 * NOT a conflict here — the write is `201 { connection, created: true }` on
 * first create and `200 { connection, created: false }` on the retry. (The
 * tuple index is a plain index in the current schema; idempotency is enforced
 * by the tuple lookup in the shared create core, with the P2002 path as a
 * belt for a future unique index.)
 *
 * `managedExternally: true` skips the bucket-policy apply entirely — the demo
 * bucket's policy is managed by Terraform in the portal, and a web-app apply
 * would race or clobber it — recording `externally-managed` as the bucket
 * policy status instead.
 */
export async function action(args: ActionFunctionArgs): Promise<Response> {
  const unauthorized = requireConnectionsApiSecret(args.request);
  if (unauthorized) return unauthorized;

  let raw: unknown;
  try {
    raw = await args.request.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
  }

  const parsed = serviceConnectionSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json(
      { error: "Validation failed", fields: parsed.error.flatten().fieldErrors },
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }
  const payload = parsed.data;

  // The org must resolve against
  // Keycloak before anything is written. The portal only sends real orgs,
  // but the shared-secret channel is authenticated, not identified — a
  // leaked secret must not be able to mint rows for phantom tenants.
  const org = await findOrganizationByAlias(payload.organization);
  if (!org) {
    return jsonError(422, `Unknown organization "${payload.organization}".`);
  }

  // The catalog-validation skip is bound to the platform-managed buckets
  // via CONNECTIONS_API_MANAGED_BUCKETS — a deployment-declared
  // allowlist (infra sets it to the demo bucket). A managedExternally create
  // for a bucket outside the list is rejected outright rather than silently
  // skipping validation: the skip exists because the PORTAL already resolved
  // the demo references, and only the demo path is trusted that far.
  const managedBuckets = managedBucketAllowlist();
  if (payload.managedExternally && !managedBuckets.includes(payload.bucketName)) {
    return jsonError(422, `Bucket "${payload.bucketName}" is not a platform-managed bucket.`);
  }

  const result = await createConnectionWithCatalogValidation(
    payload.organization,
    SERVICE_CREATED_BY,
    {
      name: payload.name,
      providerConnectionId: payload.providerConnectionId,
      bucketName: payload.bucketName,
      prefix: payload.prefix,
      grants: payload.grants,
    },
    // No access token: the catalog lookup is service-to-portal via the shared
    // lookup secret, not under a user's OIDC token. On a managedExternally
    // create (the portal's DEMO connection) the portal itself resolved the
    // provider/bucket/role references, so catalog re-validation is skipped.
    "",
    {
      skipCatalogValidation: payload.managedExternally,
      initialBucketPolicyStatus: payload.managedExternally
        ? EXTERNAL_BUCKET_POLICY_STATUS
        : undefined,
    },
  );

  if (!result.ok) {
    if (result.error === "schema") {
      return Response.json(
        { error: "Validation failed", fields: result.errors },
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
    if (result.error === "catalog") {
      return jsonError(422, result.message);
    }
    return jsonError(422, result.formError);
  }

  console.info(
    `${label} ${result.created ? "created" : "returned existing"} connection ` +
      `"${result.connection.name}" for org "${payload.organization}"` +
      `${payload.managedExternally ? " (bucket policy managed externally)" : ""}`,
  );

  return Response.json(
    { connection: toServiceConnection(result.connection), created: result.created },
    { status: result.created ? 201 : 200, headers: { "Content-Type": "application/json" } },
  );
}
