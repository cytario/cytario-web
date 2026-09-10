import { Prisma } from "~/.generated/client";
import { prisma } from "~/.server/db/prisma";
import { getProviderCatalog } from "~/.server/providers/providerCatalog.server";
import { connectionSchema } from "~/routes/connections/connection.schema";
import {
  validateBucketRef,
  validateProviderRefs,
} from "~/routes/connections/connectionGrant.server";

/** A connection config field set accepted by `createConnectionRecord`. */
export interface CreateConnectionInput {
  name: string;
  bucketName: string;
  providerConnectionId: string;
  prefix: string;
}

/** A single grant: a group scope paired with an access level. */
export interface GrantInput {
  scope: string;
  accessLevel: string;
}

/**
 * Why a connection's bucket policy is NOT applied (or re-applied) by cytario-web.
 *
 * `web` is the default: the web app computes the managed grant set and writes
 * the bucket policy itself. `externally-managed` marks a connection whose
 * bucket policy is owned by an outside system (e.g. the demo bucket, managed
 * by Terraform in admin-portal): cytario-web records the row and grants but
 * never writes that bucket's policy — an apply would race the external
 * owner's reconcile loop and either be reverted or clobber it.
 *
 * The Prisma identifier is `externally_managed` (`-` is not allowed in
 * Prisma enum names); `@map` keeps the stored value `externally-managed`.
 */
export const EXTERNAL_BUCKET_POLICY_STATUS = "externally_managed" as const;

/** A zod-validated create payload; organization is bound by the caller. */
export interface CreateConnectionPayload {
  name: string;
  providerConnectionId: string;
  bucketName: string;
  prefix: string;
  grants: GrantInput[];
}

/** Result of a shared create attempt. */
export type CreateConnectionResult =
  | { ok: true; created: true; connection: CreateConnectionRecord }
  | { ok: true; created: false; connection: CreateConnectionRecord }
  | { ok: false; error: "schema"; errors: Record<string, string[]> }
  | { ok: false; error: "catalog"; message: string }
  | { ok: false; error: "validation"; formError: string; errors?: Record<string, string[]> };

/** Result of `validateConnectionAgainstCatalogs`. */
export type CatalogValidationResult =
  | { ok: true }
  | { ok: false; error: "catalog"; message: string }
  | { ok: false; error: "validation"; formError: string; errors?: Record<string, string[]> };

/** A persisted connection config with its grants eager-loaded. */
export type CreateConnectionRecord = Awaited<ReturnType<typeof findConnectionByTuple>> & {
  grants: { scope: string; accessLevel: string }[];
};

/** The tuple a strict create conflicts on. */
export interface ConnectionTuple {
  organization: string;
  providerConnectionId: string;
  bucketName: string;
  prefix: string;
}

/**
 * The fields the (org, provider connection, bucket, prefix) tuple is created
 * from — the strict-create tuple from `createConnection.action.ts`. A row that
 * already occupies the tuple is returned as `{ created: false }` so the
 * service caller can treat the write as idempotent.
 */
async function findConnectionByTuple(tuple: ConnectionTuple) {
  return prisma.connectionConfig.findFirst({
    where: {
      organization: tuple.organization,
      providerConnectionId: tuple.providerConnectionId,
      bucketName: tuple.bucketName,
      prefix: tuple.prefix,
    },
    include: { grants: true },
  });
}

/**
 * Strictly creates — never updates an existing row. An existing
 * (organization, providerConnectionId, bucketName, prefix) tuple must surface
 * as a conflict: silently repointing the existing connection would let a
 * non-admin rewrite another scope's connection (and thereby shrink the
 * bucket's managed grant set) without any canModify check.
 */
export async function createConnectionRecord(
  organization: string,
  createdBy: string,
  config: CreateConnectionInput,
  grants: GrantInput[],
  initialBucketPolicyStatus?: string,
) {
  return prisma.connectionConfig.create({
    data: {
      organization,
      createdBy,
      ...config,
      ...(initialBucketPolicyStatus
        ? { bucketPolicyStatus: initialBucketPolicyStatus as never }
        : {}),
      grants: {
        createMany: {
          data: grants.map((g) => ({ scope: g.scope, accessLevel: g.accessLevel })),
        },
      },
    },
    include: { grants: true },
  });
}

/**
 * Validate a create payload against the org's provider + bucket catalogs.
 * Shared by the form action and the service API so both reject the same way:
 * unknown provider connection, an access level with no storage role for the
 * bucket, an allowed-scope violation, and (in portal builds) a bucket that is
 * not registered under the provider connection.
 */
export async function validateConnectionAgainstCatalogs(
  organization: string,
  accessToken: string,
  data: CreateConnectionPayload,
): Promise<CatalogValidationResult> {
  let catalog;
  try {
    catalog = await getProviderCatalog(organization, accessToken);
  } catch (error) {
    return {
      ok: false as const,
      error: "catalog" as const,
      message: error instanceof Error ? error.message : "Provider catalog is unavailable.",
    };
  }

  const refs = validateProviderRefs(catalog, data);
  if (!refs.ok) {
    return { ok: false as const, error: "validation" as const, formError: "", errors: refs.errors };
  }

  const bucketRef = await validateBucketRef(organization, accessToken, data);
  if (!bucketRef.ok) {
    if ("formError" in bucketRef) {
      return { ok: false as const, error: "catalog" as const, message: bucketRef.formError };
    }
    return {
      ok: false as const,
      error: "validation" as const,
      formError: "",
      errors: bucketRef.errors,
    };
  }

  return { ok: true as const };
}

/**
 * Shared create-connection core for the form action and the service API:
 * zod-parse the payload, validate against the org provider + bucket catalogs,
 * and strictly create the row. The tuple write is idempotent — an existing
 * (org, provider connection, bucket, prefix) row is returned as
 * `{ created: false }` (the service caller retries after a network failure and
 * must not observe a conflict). Bucket-policy application is deliberately NOT
 * part of this core: the form action applies under the acting user's STS
 * session, while the service caller records `externally-managed` (no apply).
 *
 * `skipCatalogValidation` serves the service caller creating a connection on a
 * platform-managed bucket (the DEMO connection): the portal catalog lookups of
 * §4.12 authenticate the acting USER's token, which a service-to-service caller
 * does not hold. The portal resolved the provider/bucket/role references from
 * its own persistence when it built the payload — the shared-secret channel is
 * the attestation — so re-validating them here would only guarantee a 401/422.
 * Only the shared-secret API sets this flag; the form action never does.
 */
export async function createConnectionWithCatalogValidation(
  organization: string,
  createdBy: string,
  payload: CreateConnectionPayload,
  accessToken: string,
  options?: {
    skipCatalogValidation?: boolean;
    /** Recorded atomically with the create (the managed-externally path). */
    initialBucketPolicyStatus?: string;
  },
): Promise<CreateConnectionResult> {
  const parsed = connectionSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      error: "schema",
      errors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  const data = parsed.data;

  // Idempotency pre-check: the (organization, providerConnectionId,
  // bucketName, prefix) index is a plain index, not unique — the create
  // cannot rely on a P2002 to surface the conflict, so check the tuple first
  // and return the existing row. The P2002 path below stays as the belt for
  // the check-insert race (and for a future unique index).
  const existing = await findConnectionByTuple({
    organization,
    providerConnectionId: data.providerConnectionId,
    bucketName: data.bucketName,
    prefix: data.prefix,
  });
  if (existing) {
    return { ok: true, created: false, connection: existing };
  }

  const validated = options?.skipCatalogValidation
    ? ({ ok: true } as const)
    : await validateConnectionAgainstCatalogs(organization, accessToken, data);
  if (!validated.ok) return validated as CreateConnectionResult;

  try {
    const connection = await createConnectionRecord(
      organization,
      createdBy,
      {
        name: data.name,
        bucketName: data.bucketName,
        providerConnectionId: data.providerConnectionId,
        prefix: data.prefix,
      },
      data.grants,
      options?.initialBucketPolicyStatus,
    );
    return { ok: true, created: true, connection };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const target = Array.isArray(error.meta?.target) ? (error.meta.target as string[]) : [];
      if (target.includes("scope")) {
        return {
          ok: false,
          error: "schema",
          errors: { grants: ["Each group may appear at most once on a connection."] },
        };
      }

      const existing = await findConnectionByTuple({
        organization,
        providerConnectionId: data.providerConnectionId,
        bucketName: data.bucketName,
        prefix: data.prefix,
      });
      if (existing) {
        return { ok: true, created: false, connection: existing };
      }
      return {
        ok: false,
        error: "validation",
        formError: "A database constraint was violated. Please check your input and try again.",
      };
    }
    throw error;
  }
}
