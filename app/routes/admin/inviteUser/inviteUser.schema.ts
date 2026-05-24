import { z } from "zod";

export const inviteUserSchema = z.object({
  email: z.string().email("Invalid email").max(254),
  firstName: z.string().max(255).optional().or(z.literal("")),
  lastName: z.string().max(255).optional().or(z.literal("")),
});

export type InviteUserFormData = z.infer<typeof inviteUserSchema>;
