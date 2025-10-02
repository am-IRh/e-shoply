import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

const registrationSchema = z.object({
  name: z.string().min(2),
  email: z.email("email not valid"),
  password: z.string().min(6, "password must be at least 6 characters"),
});

export const validateRegister = zValidator("json", registrationSchema, (result, c) => {
  if (!result.success) {
    return c.json(
      {
        success: false,
        message: "Validation failed",
        errors: result.error.issues.map(err => ({
          field: err.path.join("."),
          message: err.message,
        })),
      },
      400,
    );
  }
});
