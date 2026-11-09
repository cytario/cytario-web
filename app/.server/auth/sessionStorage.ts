import { Credentials } from "@aws-sdk/client-sts";
import { randomUUID } from "crypto";
import { LRUCache } from "lru-cache";
import { createSessionStorage, Session } from "react-router";

import { UserProfile } from "./getUserInfo";
import { redis } from "../db/redis";
import { createLabel } from "~/.server/logging";
import { cytarioConfig } from "~/config";
import { type NotificationInput } from "~/utils/notifications";

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  idToken: string;
}

export type ConnectionsCredentials = Record<string, Credentials>;

/** Per-org credentials: a session a member of several organizations holds each
 * org's connections' credentials in its own bucket. A request only ever mints
 * and persists its own org's slice; the others stay in Redis untouched. */
export type OrgCredentials = Record<string, ConnectionsCredentials>;

export interface SessionData {
  user: UserProfile;
  authTokens: AuthTokens;
  credentials: OrgCredentials;
  notification?: NotificationInput;
}

export type SessionFlashData = {
  error: string;
};

export type CytarioSession = Session<SessionData, SessionFlashData>;

const { cookie } = cytarioConfig;

const setSessionExpiry = async (id: string, expires: Date) => {
  const unixTimeSeconds = Math.floor(expires.getTime() / 1000);
  await redis.expireat(id, unixTimeSeconds);
};

const label = createLabel("session", "yellow");

/**
 * Sessions carry a per-session epoch in Redis. The process-local cache keys
 * on (session id, epoch): a session write on ANY replica — an org switch
 * purging credentials, a token refresh, a re-derived membership map —
 * bumps the epoch, so every other replica's next read sees the mismatch and
 * goes to Redis instead of serving its stale copy. No cross-replica
 * messaging; the epoch in Redis is the shared truth.
 *
 * Reads pay one tiny epoch field read per request and only transfer the
 * (large) session payload on a miss or epoch change.
 */
const EPOCH_FIELD = "epoch";

const cacheKey = (id: string, epoch: string) => `${id}:${epoch}`;

// Short-lived in-memory cache to absorb the session-payload reads during
// burst tile requests; the 5s TTL bounds memory, the epoch bounds staleness.
const sessionCache = new LRUCache<string, SessionData>({
  max: 1000,
  ttl: 5000,
});

const cacheSession = (id: string, epoch: string, data: unknown) => {
  if (
    data &&
    typeof data === "object" &&
    (data as SessionData).user &&
    (data as SessionData).authTokens
  ) {
    sessionCache.set(cacheKey(id, epoch), data as SessionData);
  }
};

export const sessionStorage = createSessionStorage<SessionData, SessionFlashData>({
  cookie: {
    name: "__session",
    ...cookie,
  },

  async createData(data, expires) {
    const id = randomUUID();
    console.info(`${label} Create: ${id}`);

    if (!id || !expires) {
      throw new Error("No user id found");
    }
    await redis.hset(id, "data", JSON.stringify(data), EPOCH_FIELD, "0");
    await setSessionExpiry(id, expires);

    cacheSession(id, "0", data);

    return id;
  },
  async readData(id) {
    // Epoch first (one tiny field read): a replica that has cached this
    // session at a different epoch must not serve that copy. A hash without
    // the field predates this build — its payload carries the old session
    // shape, so the session is invalid (the caller sees no session and the
    // user takes a clean login) rather than run through on shape-mismatched
    // data. createData always writes the field; every epoch value therefore
    // means exactly one thing.
    const [epochField] = await redis.hmget(id, EPOCH_FIELD);
    if (epochField === null) return null;
    const epoch = epochField;

    const cached = sessionCache.get(cacheKey(id, epoch));
    if (cached) {
      return cached;
    }

    console.info(`${label} Read (cache): ${id}`);
    const data = await redis.hget(id, "data");

    if (data) {
      const parsed = JSON.parse(data);
      cacheSession(id, epoch, parsed);
      return parsed;
    }
    return null;
  },
  async updateData(id, data, expires) {
    console.info(`${label} Update: ${id}`);

    // Data first, epoch second: a concurrent reader on another replica then
    // sees either the old epoch with either payload (its cache is still
    // authoritative) or the new epoch with the new payload — never the new
    // epoch with the old payload, which would poison its cache.
    await redis.hset(id, "data", JSON.stringify(data));
    if (expires) {
      await setSessionExpiry(id, expires);
    }
    const nextEpoch = await redis.hincrby(id, EPOCH_FIELD, 1);

    cacheSession(id, String(nextEpoch), data);
  },
  async deleteData(id) {
    console.info(`${label} Delete: ${id}`);
    await redis.hdel(id, "data", EPOCH_FIELD);
    // A logged-out session must not keep resolving on this replica from the
    // process cache: the LRU keys on (id, epoch), so drop every epoch's copy.
    for (const key of sessionCache.keys()) {
      if (key.startsWith(`${id}:`)) sessionCache.delete(key);
    }
  },
});
