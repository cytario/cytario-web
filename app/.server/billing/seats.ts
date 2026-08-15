import { z } from "zod";

import {
  findOrganizationGroupByPath,
  getOrganizationGroupMembers,
  getOrganizationMembers,
} from "~/.server/auth/keycloakAdmin";
import { hostRequestStorage } from "~/.server/hostRequestContext";
import { createLabel } from "~/.server/logging";
import { cytarioConfig } from "~/config";

const label = createLabel("seats", "cyan");

const SEATS_LOOKUP_PATH = "/org";
const SEATS_LOOKUP_TIMEOUT_MS = 10_000;

export const VIEWING_SEAT_EXHAUSTED_MESSAGE =
  "Viewing seat limit reached - increase seats in the billing portal before inviting more members.";
export const ANALYSIS_SEAT_EXHAUSTED_MESSAGE =
  "Analysis seat limit reached - increase Analysis seats in the billing portal before assigning more analysts.";

export interface SeatInfo {
  viewingSeats: number;
  analysisSeats: number;
  analystGroup: string;
}

const orgSeatsSchema = z.object({
  viewing_seats: z.number().int().nonnegative(),
  analysis_seats: z.number().int().nonnegative(),
  analyst_group: z.string().min(1).default("analysts"),
});

const seatsCache = new WeakMap<Request, Promise<SeatInfo | null>>();

/**
 * Fetches the active organization's seat counts from the admin-portal `/org`
 * endpoint. The endpoint resolves the caller's organization server-side (RFC
 * 8693 token exchange), so only the user's access token travels as a Bearer
 * header. Returns `null` in non-SaaS builds (no portal configured) and the
 * gates treat `null` as "no SaaS seat surface" and skip enforcement.
 *
 * Cached per request only: seat counts change in real time and must never be
 * served from a cross-request cache.
 */
export async function getSeatInfo(request: Request): Promise<SeatInfo | null> {
  if (cytarioConfig.providers.source !== "portal" || !cytarioConfig.providers.portalInternalUrl) {
    return null;
  }

  const cached = seatsCache.get(request);
  if (cached) return cached;

  const promise = fetchSeatInfo().catch((error: unknown) => {
    seatsCache.delete(request);
    throw error;
  });
  seatsCache.set(request, promise);
  return promise;
}

async function fetchSeatInfo(): Promise<SeatInfo> {
  const store = hostRequestStorage.getStore();
  const accessToken = store?.authTokens.accessToken;
  if (!accessToken) {
    throw new Error(
      "Seat lookup is misconfigured: no access token available for the portal token exchange.",
    );
  }

  const { portalInternalUrl } = cytarioConfig.providers;
  const base = portalInternalUrl!.endsWith("/") ? portalInternalUrl! : `${portalInternalUrl}/`;
  const url = new URL(SEATS_LOOKUP_PATH, base);

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(SEATS_LOOKUP_TIMEOUT_MS),
    });
  } catch (error) {
    console.error(`${label} Seat lookup request failed:`, error);
    throw new Error("Seat lookup is currently unavailable. Try again shortly.");
  }

  if (!response.ok) {
    console.error(`${label} Seat lookup returned ${response.status}`);
    throw new Error("Seat lookup is currently unavailable. Try again shortly.");
  }

  const raw = await response.json();
  const parsed = orgSeatsSchema.parse(raw);
  return {
    viewingSeats: parsed.viewing_seats,
    analysisSeats: parsed.analysis_seats,
    analystGroup: parsed.analyst_group,
  };
}

/**
 * Enforce the viewing-seat gate before inviting a new member. A no-op when
 * `getSeatInfo` returns `null` (non-SaaS) or when the org still has headroom.
 * Throws a 409 when every non-analyst viewing seat is already taken.
 */
export async function assertViewingSeatAvailable(request: Request, orgId: string): Promise<void> {
  const seatInfo = await getSeatInfo(request);
  if (!seatInfo) return;

  const [members, analystGroup] = await Promise.all([
    getOrganizationMembers(orgId),
    findOrganizationGroupByPath(orgId, seatInfo.analystGroup),
  ]);
  const analysts = analystGroup ? await getOrganizationGroupMembers(orgId, analystGroup.id) : [];
  const nonAnalysts = members.length - analysts.length;

  if (nonAnalysts >= seatInfo.viewingSeats) {
    throw new Response(VIEWING_SEAT_EXHAUSTED_MESSAGE, { status: 409 });
  }
}

/**
 * Enforce the analysis-seat gate when `targetGroupId` is the analyst group. A
 * no-op when `getSeatInfo` returns `null` (non-SaaS), when the target is not
 * the analyst group, or when an analysis seat is still free. Throws a 409 when
 * the analyst group is already at its seat limit.
 */
export async function assertAnalysisSeatAvailable(
  request: Request,
  orgId: string,
  targetGroupId: string,
): Promise<void> {
  const seatInfo = await getSeatInfo(request);
  if (!seatInfo) return;

  const analystGroup = await findOrganizationGroupByPath(orgId, seatInfo.analystGroup);
  if (!analystGroup || analystGroup.id !== targetGroupId) return;

  const analysts = await getOrganizationGroupMembers(orgId, analystGroup.id);
  if (analysts.length >= seatInfo.analysisSeats) {
    throw new Response(ANALYSIS_SEAT_EXHAUSTED_MESSAGE, { status: 409 });
  }
}
