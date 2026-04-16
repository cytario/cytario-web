import { z } from "zod";

export const createGroupSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Required")
    .max(255, "Maximum 255 characters")
    .refine((s) => !s.includes("/"), "Slashes are not allowed"),
});

export type CreateGroupFormData = z.infer<typeof createGroupSchema>;
