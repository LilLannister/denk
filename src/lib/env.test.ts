import { describe, expect, it } from "vitest";

import { parseEnvironment } from "./env";

const validEnvironment = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://denk:denk@localhost:5432/denk",
  BETTER_AUTH_SECRET: "test-secret-that-is-at-least-32-characters",
  BETTER_AUTH_URL: "http://localhost:3000",
};

describe("parseEnvironment", () => {
  it("accepts valid DENK environment variables", () => {
    const environment = parseEnvironment(validEnvironment);

    expect(environment.NODE_ENV).toBe("test");
    expect(environment.DATABASE_URL).toBe(
      "postgresql://denk:denk@localhost:5432/denk",
    );
    expect(environment.BETTER_AUTH_SECRET).toBe(
      "test-secret-that-is-at-least-32-characters",
    );
    expect(environment.BETTER_AUTH_URL).toBe("http://localhost:3000");
  });

  it("rejects a missing database URL", () => {
    expect(() =>
      parseEnvironment({
        ...validEnvironment,
        DATABASE_URL: undefined,
      }),
    ).toThrow();
  });

  it("rejects a non-PostgreSQL database URL", () => {
    expect(() =>
      parseEnvironment({
        ...validEnvironment,
        DATABASE_URL: "mysql://localhost:3306/denk",
      }),
    ).toThrow("DATABASE_URL must be a PostgreSQL connection URL");
  });

  it("rejects a short Better Auth secret", () => {
    expect(() =>
      parseEnvironment({
        ...validEnvironment,
        BETTER_AUTH_SECRET: "too-short",
      }),
    ).toThrow("BETTER_AUTH_SECRET must contain at least 32 characters");
  });

  it("rejects an invalid Better Auth URL", () => {
    expect(() =>
      parseEnvironment({
        ...validEnvironment,
        BETTER_AUTH_URL: "not-a-url",
      }),
    ).toThrow("BETTER_AUTH_URL must be a valid URL");
  });
});
