import { describe, expect, it } from "vitest";
import { parseEnvironment } from "./env";

describe("parseEnvironment", () => {
  it("accepts valid DENK environment variables", () => {
    const environment = parseEnvironment({
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://denk:denk@localhost:5432/denk",
    });

    expect(environment.NODE_ENV).toBe("test");
    expect(environment.DATABASE_URL).toBe(
      "postgresql://denk:denk@localhost:5432/denk",
    );
  });

  it("rejects a missing database URL", () => {
    expect(() =>
      parseEnvironment({
        NODE_ENV: "test",
      }),
    ).toThrow();
  });

  it("rejects a non-PostgreSQL database URL", () => {
    expect(() =>
      parseEnvironment({
        NODE_ENV: "test",
        DATABASE_URL: "mysql://localhost:3306/denk",
      }),
    ).toThrow("DATABASE_URL must be a PostgreSQL connection URL");
  });
});
