import { z } from "zod";

/**
 * Validate a payload against a Zod schema.
 * Returns { success: true, data } or { success: false, errors }.
 */
export function validate<T>(
  schema: z.ZodSchema<T>,
  payload: unknown
): { success: true; data: T } | { success: false; errors: string[] } {
  const result = schema.safeParse(payload);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    errors: result.error.issues.map(
      (i) => `${i.path.join(".")}: ${i.message}`
    ),
  };
}

/**
 * Validate and throw on failure. For use at agent handler entry points.
 */
export function validateOrThrow<T>(
  schema: z.ZodSchema<T>,
  payload: unknown,
  context: string
): T {
  const result = validate(schema, payload);
  if (!result.success) {
    throw new Error(
      `${context}: invalid payload — ${result.errors.join("; ")}`
    );
  }
  return result.data;
}
