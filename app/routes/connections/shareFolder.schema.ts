import { z } from "zod";

import {
  bucketNameSchema,
  connectionNameSchema,
  prefixSchema,
  scopeSchema,
} from "./connection.schema";

/**
 * A folder share: the user supplies a name, a target group scope, and a provider
 * role; the bucket, provider connection, and prefix are carried from the folder
 * context (validated identically to a connection). No free-text role/endpoint is
 * accepted.
 */
export const shareFolderSchema = z.object({
  name: connectionNameSchema,
  scope: scopeSchema,
  providerRoleId: z.string().min(1, "A provider role is required"),
  bucketName: bucketNameSchema,
  providerConnectionId: z.string().min(1, "A provider connection is required"),
  prefix: prefixSchema.default(""),
});

export type ShareFolderFormData = z.input<typeof shareFolderSchema>;
export type ShareFolderValues = z.output<typeof shareFolderSchema>;
