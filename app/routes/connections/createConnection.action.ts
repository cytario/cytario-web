import { type ActionFunctionArgs, redirect } from "react-router";

import { connectionSchema } from "./connection.schema";
import { applyGrantsAndRecordStatus } from "./connectionGrant.server";
import { Prisma } from "~/.generated/client";
import { authContext } from "~/.server/auth/authMiddleware";
import { sessionContext } from "~/.server/auth/sessionMiddleware";
import { sessionStorage } from "~/.server/auth/sessionStorage";
import {
  createConnectionRecord,
  validateConnectionAgainstCatalogs,
} from "~/.server/connections/createConnection.server";
import type { GrantInput } from "~/.server/connections/createConnection.server";
import { getProviderCatalog } from "~/.server/providers/providerCatalog.server";
import { cytarioConfig } from "~/config";
import { canCreate } from "~/utils/authorization";
import { getPrefix } from "~/utils/pathUtils";
import { constructS3Url } from "~/utils/resourceId";
import { isAllowedS3Host } from "~/utils/s3HostAllowlist";

/** https://, or loopback http in a local environment — the same carve-out the
 * S3-host allowlist applies, so the probe can never be pointed at a plaintext
 * intranet host before the allowlist check even runs. */
function isValidPublicEndpointScheme(endpoint: string): boolean {
  const parsed = new URL(endpoint);
  if (parsed.protocol === "https:") return true;
  return isAllowedS3Host(endpoint);
}

/** A connection config field set for `createConnectionRecord`. */
export type {
  CreateConnectionInput,
  GrantInput,
} from "~/.server/connections/createConnection.server";

export function parseGrants(formData: FormData): GrantInput[] {
  const indexSet = new Set<number>();
  for (const key of formData.keys()) {
    const match = key.match(/^grants\[(\d+)\]\.scope$/);
    if (match) indexSet.add(Number(match[1]));
  }
  return [...indexSet]
    .sort((a, b) => a - b)
    .map((index) => ({
      scope: String(formData.get(`grants[${index}].scope`) ?? ""),
      accessLevel: String(formData.get(`grants[${index}].accessLevel`) ?? ""),
    }));
}

export const createConnection = createConnectionRecord;

export function uniqueViolationErrors(error: Prisma.PrismaClientKnownRequestError) {
  const target = Array.isArray(error.meta?.target) ? (error.meta.target as string[]) : [];
  if (target.includes("scope")) {
    return { grants: ["Each group may appear at most once on a connection."] };
  }
  return {
    formError: "A database constraint was violated. Please check your input and try again.",
  };
}

/** Outcome of the create-time probe of a public provider's bucket: a refusal
 * blocks the create; a missing CORS rule is a warning the admin must fix on the
 * bucket — Cytario holds no credential and cannot write the rule itself. */
interface PublicBucketProbeOutcome {
  formError?: string;
  corsWarning?: string;
}

async function probePublicBucket(
  organization: string,
  accessToken: string,
  refs: {
    providerConnectionId: string;
    bucketName: string;
    prefix: string;
    publicEndpoint?: string | null;
  },
): Promise<PublicBucketProbeOutcome> {
  let catalog;
  try {
    catalog = await getProviderCatalog(organization, accessToken);
  } catch (error) {
    return {
      formError: error instanceof Error ? error.message : "Provider catalog is unavailable.",
    };
  }
  const providerConnection = catalog.providerConnections.find(
    (c) => c.id === refs.providerConnectionId,
  );
  if (!providerConnection) {
    return { formError: "Unknown provider connection" };
  }

  const prefix = getPrefix(refs.prefix) ?? "";
  const query = new URLSearchParams({ "list-type": "2", "max-keys": "1" });
  if (prefix) query.set("prefix", prefix);
  const bucketUrl = constructS3Url(
    {
      bucketName: refs.bucketName,
      region: providerConnection.region,
      endpoint: refs.publicEndpoint ?? providerConnection.endpoint,
    },
    "",
  );
  // SSRF surface: the request host derives from the catalog endpoint (or the
  // user-typed per-connection endpoint) plus the submitted bucket name — never
  // a bare user-supplied URL — and is checked against the deployment allowlist
  // so the probe cannot become a port-scan oracle against an internal host an
  // org admin pointed it at.
  if (!isAllowedS3Host(bucketUrl)) {
    return {
      formError: `The provider's endpoint for "${refs.bucketName}" is not an allowed storage host. Ask an administrator to add it to the allowed S3 hosts.`,
    };
  }
  const url = `${bucketUrl}?${query.toString()}`;

  let listResponse: Response;
  try {
    listResponse = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return {
      formError: `The bucket "${refs.bucketName}" could not be reached anonymously — check the provider's endpoint and region.`,
    };
  }

  if (!listResponse.ok) {
    return {
      formError: `The bucket "${refs.bucketName}" does not allow public listing (HTTP ${listResponse.status}). A public connection requires a bucket policy that grants everyone s3:ListBucket.`,
    };
  }

  const origin = new URL(cytarioConfig.endpoints.webapp).origin;
  let corsResponse: Response;
  try {
    corsResponse = await fetch(url, {
      method: "GET",
      headers: { Origin: origin },
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return {
      corsWarning: `Browser reads may be blocked: the bucket "${refs.bucketName}" could not be probed for cross-origin access. It must allow GET/HEAD from ${origin} (or any origin).`,
    };
  }
  const allowOrigin = corsResponse.headers.get("access-control-allow-origin");
  if (!allowOrigin || (allowOrigin !== "*" && allowOrigin !== origin)) {
    return {
      corsWarning: `Browser reads will be blocked: the bucket "${refs.bucketName}" does not allow cross-origin reads from ${origin}. Add a CORS rule allowing GET/HEAD from this origin (or any origin).`,
    };
  }

  return {};
}

export const createAction = async ({ request, context }: ActionFunctionArgs) => {
  const { user, authTokens } = context.get(authContext);
  if (!user.organization) {
    throw new Error("Active organization missing from session");
  }

  const formData = await request.formData();

  const rawData = {
    name: String(formData.get("name") ?? ""),
    providerConnectionId: String(formData.get("providerConnectionId") ?? ""),
    bucketName: String(formData.get("bucketName") ?? ""),
    prefix: String(formData.get("prefix") ?? ""),
    publicEndpoint: String(formData.get("publicEndpoint") ?? ""),
    grants: parseGrants(formData),
  };

  const result = connectionSchema.safeParse(rawData);
  if (!result.success) {
    return { errors: result.error.flatten().fieldErrors, status: "error" as const };
  }
  const data = result.data;

  for (const grant of data.grants) {
    if (!canCreate(user, { organization: user.organization, ownerScope: grant.scope })) {
      return {
        errors: { grants: [`Not authorized to create a grant for scope "${grant.scope}"`] },
        status: "error" as const,
      };
    }
  }

  const validated = await validateConnectionAgainstCatalogs(
    user.organization,
    authTokens.accessToken,
    data,
  );
  if (!validated.ok) {
    if (validated.error === "catalog") {
      return { formError: validated.message, status: "error" as const };
    }
    return {
      errors: validated.errors ?? {},
      formError: validated.formError || undefined,
      status: "error" as const,
    };
  }

  // A public provider's bucket must be anonymously listable before the row is
  // written — the connection would otherwise be created unusable.
  const providerCatalog = await getProviderCatalog(user.organization, authTokens.accessToken).catch(
    () => undefined,
  );
  const providerIsPublic = providerCatalog?.providerConnections.some(
    (c) => c.id === data.providerConnectionId && c.isPublic,
  );
  // Stripped for a non-public provider: the endpoint override is meaningless
  // there and must never persist.
  const publicEndpoint = providerIsPublic ? (data.publicEndpoint ?? null) : null;
  if (publicEndpoint && !isValidPublicEndpointScheme(publicEndpoint)) {
    return {
      errors: {
        publicEndpoint: [
          "The endpoint must be an https:// URL (loopback http://localhost[:port] or http://127.0.0.1[:port] is allowed in development and test).",
        ],
      },
      status: "error" as const,
    };
  }
  let publicProbeWarning: string | undefined;
  if (providerIsPublic) {
    const probe = await probePublicBucket(user.organization, authTokens.accessToken, {
      providerConnectionId: data.providerConnectionId,
      bucketName: data.bucketName,
      prefix: data.prefix,
      publicEndpoint,
    });
    if (probe.formError) {
      return { formError: probe.formError, status: "error" as const };
    }
    publicProbeWarning = probe.corsWarning;
  }

  const session = context.get(sessionContext);

  try {
    const created = await createConnectionRecord(
      user.organization,
      user.sub,
      {
        name: data.name,
        bucketName: data.bucketName,
        providerConnectionId: data.providerConnectionId,
        prefix: data.prefix,
        publicEndpoint,
      },
      data.grants,
    );
    const outcome = await applyGrantsAndRecordStatus(created, {
      user,
      idToken: session.get("authTokens")?.idToken ?? "",
      accessToken: session.get("authTokens")?.accessToken ?? "",
    });
    session.set("notification", {
      status: outcome.status === "applied" && !publicProbeWarning ? "success" : "warning",
      message:
        outcome.status === "applied" && !publicProbeWarning
          ? "Connection added successfully."
          : `Connection added. ${[
              outcome.status === "applied" ? undefined : outcome.warning,
              publicProbeWarning,
            ]
              .filter(Boolean)
              .join(" ")}`,
    });

    return redirect(`/connections/${created.id}`, {
      headers: { "Set-Cookie": await sessionStorage.commitSession(session) },
    });
  } catch (error) {
    if (error instanceof Response) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const target = Array.isArray(error.meta?.target) ? (error.meta.target as string[]) : [];
      if (target.includes("scope")) {
        return {
          errors: { grants: ["Each group may appear at most once on a connection."] },
          status: "error" as const,
        };
      }
      return { errors: uniqueViolationErrors(error), status: "error" as const };
    }

    console.error("Error creating connection:", error);
    return {
      formError: "Could not add the connection. Try again or check the server logs.",
      status: "error" as const,
    };
  }
};
