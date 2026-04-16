import { z } from "zod";

export const createGroupSchema = z.object({
  name: z
    .string()
    .min(1, "Required")
    .max(255, "Maximum 255 characters")
    .refine((s) => !s.includes("/"), "Slashes are not allowed")
    .transform((s) => s.trim()),
});

export type CreateGroupFormData = z.infer<typeof createGroupSchema>;
