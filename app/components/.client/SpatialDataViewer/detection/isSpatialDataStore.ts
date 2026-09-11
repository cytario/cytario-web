import type { SignedFetch } from "~/utils/signedFetch";

const SPATIAL_ELEMENT_GROUPS = ["images", "points", "labels", "shapes"] as const;

interface ZarrV3RootNode {
  node_type?: string;
  zarr_format?: number;
  consolidated_metadata?: {
    metadata?: Record<string, { node_type?: string; attributes?: Record<string, unknown> }>;
  };
  attributes?: Record<string, unknown>;
}

/**
 * Fetch and parse root metadata once — zarr v3 `zarr.json` when present,
 * falling back to v2 `.zattrs`. Returns null when neither resolves.
 */
async function fetchRootAttrs(
  httpsUrl: string,
  signedFetch: SignedFetch,
): Promise<Record<string, unknown> | null> {
  const v3 = await signedFetch(`${httpsUrl.replace(/\/$/, "")}/zarr.json`);
  if (v3.ok) {
    const json = (await v3.json().catch(() => null)) as ZarrV3RootNode | null;
    const attrs = json?.attributes;
    if (attrs) return attrs;
  }

  const v2 = await signedFetch(`${httpsUrl.replace(/\/$/, "")}/.zattrs`);
  if (v2.ok) {
    // zarr v2 .zattrs holds the group's attributes directly — no wrapper key.
    const attrs = (await v2.json().catch(() => null)) as Record<string, unknown> | null;
    return attrs ?? null;
  }

  return null;
}

function hasSpatialElementGroups(attrs: Record<string, unknown>): boolean {
  const spatialAttrs = attrs["spatialdata_attrs"];
  const consolidatedChildren = attrs["consolidated_metadata"];
  const spatialGroupNames =
    (spatialAttrs && typeof spatialAttrs === "object" && Object.keys(spatialAttrs).length > 0) ||
    (consolidatedChildren &&
      typeof consolidatedChildren === "object" &&
      hasElementGroupKeys(consolidatedChildren));
  return Boolean(spatialGroupNames);
}

function hasElementGroupKeys(node: unknown): boolean {
  if (!node || typeof node !== "object") return false;
  const candidate = node as { consolidated_metadata?: { metadata?: Record<string, unknown> } };
  const metadata = candidate.consolidated_metadata?.metadata;
  if (!metadata) return false;
  return SPATIAL_ELEMENT_GROUPS.some((group) =>
    Boolean(metadata[group] && typeof metadata[group] === "object"),
  );
}

const detectionCache = new Map<string, boolean>();

/**
 * Cheap root-metadata sniff to distinguish a SpatialData `.zarr` store from a
 * plain (OME-)Zarr one. True means the caller should mount the SpatialData
 * viewer; false means fall back to the OME-Zarr viewer. Cached per resourceId
 * — the sniff issues two HTTP requests at most once per resource.
 */
export async function isSpatialDataStore(
  resourceId: string,
  httpsUrl: string,
  signedFetch: SignedFetch,
): Promise<boolean> {
  const cached = detectionCache.get(resourceId);
  if (cached !== undefined) return cached;

  const attrs = await fetchRootAttrs(httpsUrl, signedFetch);
  const result = attrs !== null && hasSpatialElementGroups(attrs);
  detectionCache.set(resourceId, result);
  return result;
}

/** Test-only: clears the per-resourceId sniff cache. */
export function __resetSpatialDataDetectionCache(): void {
  detectionCache.clear();
}
