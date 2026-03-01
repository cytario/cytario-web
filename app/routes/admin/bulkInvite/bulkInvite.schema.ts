import { z } from "zod";

export const bulkInviteRowSchema = z.object({
  email: z.string().email("Invalid email").max(254),
  firstName: z.string().min(1, "Required").max(255),
  lastName: z.string().min(1, "Required").max(255),
});

export type BulkInviteRow = z.infer<typeof bulkInviteRowSchema>;

export const bulkInviteSchema = z.object({
  groupPath: z.string().min(1, "Required").max(255),
  enabled: z.boolean(),
  rows: z
    .array(bulkInviteRowSchema)
    .min(1, "At least one row is required")
    .max(100, "Maximum 100 invites per batch"),
});

export type BulkInviteData = z.infer<typeof bulkInviteSchema>;
