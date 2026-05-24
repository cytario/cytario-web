import { z } from "zod";

import { ORG_ROOT_ADMIN_SCOPE } from "~/utils/authorization";

export const createGroupSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Required")
    .max(255, "Maximum 255 characters")
    .refine((s) => !s.includes("/"), "Slashes are not allowed")
    .refine((s) => s !== ORG_ROOT_ADMIN_SCOPE, "Reserved name"),
});

export type CreateGroupFormData = z.infer<typeof createGroupSchema>;
