import { z } from "zod";

export const inviteUserSchema = z.object({
  email: z.string().email("Invalid email").max(254),
  groupIds: z.array(z.string()).default([]),
});

export type InviteUserInput = z.input<typeof inviteUserSchema>;
export type InviteUserFormData = z.output<typeof inviteUserSchema>;
