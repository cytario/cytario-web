import { z } from "zod";

export const inviteUserSchema = z.object({
  email: z.string().email("Invalid email").max(254),
  firstName: z.string().min(1, "Required").max(255),
  lastName: z.string().min(1, "Required").max(255),
  groupPath: z.string().min(1, "Required").max(255),
});

export type InviteUserFormData = z.infer<typeof inviteUserSchema>;
