import { z } from "zod";

export const updateUserSchema = z.object({
  email: z.string().email({ message: "Invalid email" }).max(254),
  firstName: z.string().min(1, "Required").max(255),
  lastName: z.string().min(1, "Required").max(255),
  enabled: z.boolean(),
});

export type UpdateUserFormData = z.infer<typeof updateUserSchema>;
