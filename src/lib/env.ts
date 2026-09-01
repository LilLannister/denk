import { z } from "zod";

const environmentSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required")
    .refine(
      (value) =>
        value.startsWith("postgresql://") || value.startsWith("postgres://"),
      "DATABASE_URL must be a PostgreSQL connection URL",
    ),
  BETTER_AUTH_SECRET: z
    .string()
    .min(32, "BETTER_AUTH_SECRET must contain at least 32 characters"),

  BETTER_AUTH_URL: z.string().url("BETTER_AUTH_URL must be a valid URL"),
});

export function parseEnvironment(input: Record<string, string | undefined>) {
  return environmentSchema.parse(input);
}

export type Environment = z.infer<typeof environmentSchema>;
