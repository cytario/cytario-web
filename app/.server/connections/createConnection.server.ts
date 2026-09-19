import { Prisma } from "~/.generated/client";
import { prisma } from "~/.server/db/prisma";
import { getProviderCatalog } from "~/.server/providers/providerCatalog.server";
import { connectionSchema } from "~/routes/connections/connection.schema";
import {
  validateBucketRef,
  validateProviderRefs,
} from "~/routes/connections/connectionGrant.server";

export interface CreateConnectionInput {
  name: string;
  bucketName: string;
  providerConnectionId: string;
  prefix: string;
}

export interface GrantInput {
  scope: string;
  accessLevel: string;
}

// `externally-managed` marks a connection whose bucket policy is owned by an
// outside system: cytario-web records the row and grants but never writes
// that bucket's policy — an apply would race the external owner's reconcile
// loop. The Prisma identifier is `externally_managed` (`-` not allowed in
// enum names); `@map` keeps the stored value `externally-managed`.
export const EXTERNAL_BUCKET_POLICY_STATUS = "externally_managed" as const;

export interface CreateConnectionPayload {
  name: string;
  providerConnectionId: string;
  bucketName: string;
  prefix: string;
  grants: GrantInput[];
}

export type CreateConnectionResult =
  | { ok: true; created: true; connection: CreateConnectionRecord }
  | { ok: true; created: false; connection: CreateConnectionRecord }
  | { ok: false; error: "schema"; errors: Record<string, string[]> }
  | { ok: false; error: "catalog"; message: string }
  | { ok: false; error: "validation"; formError: string; errors?: Record<string, string[]> };

export type CatalogValidationResult =
  | { ok: true }
  | { ok: false; error: "catalog"; message: string }
  | { ok: false; error: "validation"; formError: string; errors?: Record<string, string[]> };

export type CreateConnectionRecord = Awaited<ReturnType<typeof findConnectionByTuple>> & {
  grants: { scope: string; accessLevel: string }[];
};

export interface ConnectionTuple {
  organization: string;
  providerConnectionId: string;
  bucketName: string;
  prefix: string;
}

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

// Strictly creates — never updates: repointing an existing tuple would let a
// non-admin rewrite another scope's connection without any canModify check.
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

// Shared by the form action and the service API so both reject the same way.
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

// The tuple write is idempotent — an existing row is returned as
// `{ created: false }` so a service caller retrying after a network failure
// never observes a conflict. Bucket-policy application is deliberately NOT
// part of this core: the form action applies under the acting user's STS
// session, while the service caller records `externally-managed` (no apply).
// `skipCatalogValidation` serves the service caller on a platform-managed
// bucket: portal catalog lookups authenticate the acting USER's token, which
// a service-to-service caller does not hold — the shared-secret channel is
// the attestation, and re-validating would only guarantee a 401/422.
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

  // Idempotency pre-check: the tuple index is plain, not unique, so the
  // create cannot rely on a P2002 — check first; the P2002 path below stays
  // as the belt for the check-insert race.
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
