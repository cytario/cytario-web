import { Credentials } from "@aws-sdk/client-sts";
import { create } from "zustand";
import { createJSONStorage, devtools, persist } from "zustand/middleware";

import { BucketConfig } from "~/.generated/client";

/**
 * Credentials store for managing S3 bucket credentials and configuration.
 *
 * IMPORTANT: The key used in this store should be "provider/bucketName",
 * not the full file path. Credentials are per-bucket, not per-file.
 *
 * Example:
 * - Correct: setCredentials("aws/my-bucket", credentials, bucketConfig)
 * - Incorrect: setCredentials("aws/my-bucket/path/to/file.csv", credentials)
 */
interface CredentialsStore {
  credentials: Record<string, Credentials>;
  bucketConfigs: Record<string, BucketConfig>;
  setCredentials: (
    key: string,
    credentials: Credentials,
    bucketConfig?: BucketConfig,
  ) => void;
  getCredentials: (key: string) => Credentials | null;
  getBucketConfig: (key: string) => BucketConfig | null;
  hasCredentials: (key: string) => boolean;
  clearCredentials: (key: string) => void;
  clearAll: () => void;
}

const name = "CredentialsStore";

export const useCredentialsStore = create<CredentialsStore>()(
  devtools(
    persist(
      (set, get) => ({
        credentials: {},
        bucketConfigs: {},

        setCredentials: (
          key: string,
          credentials: Credentials,
          bucketConfig?: BucketConfig,
        ) => {
          set(
            (state) => ({
              credentials: {
                ...state.credentials,
                [key]: credentials,
              },
              bucketConfigs: bucketConfig
                ? {
                    ...state.bucketConfigs,
                    [key]: bucketConfig,
                  }
                : state.bucketConfigs,
            }),
            false,
            "setCredentials",
          );
        },

        getCredentials: (key: string) => {
          return get().credentials[key] ?? null;
        },

        getBucketConfig: (key: string) => {
          return get().bucketConfigs[key] ?? null;
        },

        hasCredentials: (key: string) => {
          return key in get().credentials;
        },

        clearCredentials: (key: string) => {
          set(
            (state) => {
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              const { [key]: _, ...rest } = state.credentials;
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              const { [key]: __, ...restConfigs } = state.bucketConfigs;
              return { credentials: rest, bucketConfigs: restConfigs };
            },
            false,
            "clearCredentials",
          );
        },

        clearAll: () => {
          set({ credentials: {}, bucketConfigs: {} }, false, "clearAll");
        },
      }),
      {
        name,
        storage: createJSONStorage(() => sessionStorage),
      },
    ),
    { name },
  ),
);
