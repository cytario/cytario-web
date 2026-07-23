import { z } from "zod";

import {
  bucketNameSchema,
  connectionNameSchema,
  grantSchema,
  prefixSchema,
} from "./connection.schema";

/**
 * A folder share: the user supplies a name, one or more grants (each a group
 * scope + provider role); the bucket, provider connection, and prefix are
 * carried from the folder context (validated identically to a connection). No
 * free-text role/endpoint is accepted.
 */
export const shareFolderSchema = z
  .object({
    name: connectionNameSchema,
    bucketName: bucketNameSchema,
    providerConnectionId: z.string().min(1, "A provider connection is required"),
    prefix: prefixSchema.default(""),
    grants: z.array(grantSchema).min(1, "At least one grant is required"),
  })
  .refine((data) => new Set(data.grants.map((g) => g.scope)).size === data.grants.length, {
    message: "Each group may appear at most once",
    path: ["grants"],
  });

export type ShareFolderFormData = z.input<typeof shareFolderSchema>;
export type ShareFolderValues = z.output<typeof shareFolderSchema>;
