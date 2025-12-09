import { Credentials } from "@aws-sdk/client-sts";
import { randomUUID } from "crypto";
import { LRUCache } from "lru-cache";
import { createSessionStorage, Session } from "react-router";

import { UserProfile } from "./getUserInfo";
import { redis } from "../db/redis";
import { createLabel } from "~/.server/logging";
import { NotificationInput } from "~/components/Notification/Notification.store";
import { cytarioConfig } from "~/config";

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  idToken: string;
}

export type SessionCredentials = Record<string, Credentials>;

export interface SessionData {
  user: UserProfile;
  authTokens: AuthTokens;
  credentials: SessionCredentials;
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

// In-memory cache for session data to reduce cache store reads during burst tile requests
// TTL of 5 seconds balances performance with session data freshness
const sessionCache = new LRUCache<string, SessionData>({
  max: 1000, // Maximum number of sessions to cache
  ttl: 5000, // 5 seconds TTL - short enough to keep data fresh
});

export const sessionStorage = createSessionStorage<
  SessionData,
  SessionFlashData
>({
  cookie: {
    name: "__session",
    ...cookie,
  },

  async createData(data, expires) {
    // Anonymouse session support via random UUID
    const id = data.user?.sub ?? randomUUID();
    console.info(`${label} Create: ${id}`);

    if (!id || !expires) {
      throw new Error("No user id found");
    }
    await redis.hset(id, "data", JSON.stringify(data));
    await setSessionExpiry(id, expires);

    // Cache the newly created session if it has all required fields
    if (data.user && data.authTokens && data.credentials) {
      sessionCache.set(id, data as SessionData);
    }

    return id;
  },
  async readData(id) {
    // Check cache first
    const cached = sessionCache.get(id);
    if (cached) {
      return cached;
    }

    // Cache miss - read from cache store (Redis/Valkey)
    console.info(`${label} Read (cache): ${id}`);
    const data = await redis.hget(id, "data");

    if (data) {
      const parsed = JSON.parse(data);
      // Cache for subsequent requests
      sessionCache.set(id, parsed);
      return parsed;
    }
    return null;
  },
  async updateData(id, data, expires) {
    console.info(`${label} Update: ${id}`);

    await redis.hset(id, "data", JSON.stringify(data));
    if (expires) {
      await setSessionExpiry(id, expires);
    }

    // Update cache to keep it in sync
    if (data.user && data.authTokens && data.credentials) {
      sessionCache.set(id, data as SessionData);
    } else {
      // If data is partial, invalidate cache
      sessionCache.delete(id);
    }
  },
  async deleteData(id) {
    console.info(`${label} Delete: ${id}`);
    await redis.hdel(id, "data");
    // Remove from cache when deleted
    sessionCache.delete(id);
  },
});
