import { z } from "zod";

export const bulkInviteRowSchema = z.object({
  email: z.string().email("Invalid email").max(254),
  firstName: z.string().max(255).optional().or(z.literal("")),
  lastName: z.string().max(255).optional().or(z.literal("")),
});

export type BulkInviteRow = z.infer<typeof bulkInviteRowSchema>;

export const bulkInviteSchema = z.object({
  rows: z
    .array(bulkInviteRowSchema)
    .min(1, "At least one row is required")
    .max(100, "Maximum 100 invites per batch"),
});

export type BulkInviteData = z.infer<typeof bulkInviteSchema>;
