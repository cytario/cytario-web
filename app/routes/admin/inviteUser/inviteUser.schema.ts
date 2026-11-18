import { z } from "zod";

export const inviteUserSchema = z.object({
  emails: z
    .array(z.string().email("Invalid email").max(254))
    .min(1, "Enter at least one email address")
    .max(100, "Enter at most 100 email addresses"),
  groupIds: z.array(z.string()).default([]),
});

export type InviteUserInput = z.input<typeof inviteUserSchema>;
export type InviteUserFormData = z.output<typeof inviteUserSchema>;
