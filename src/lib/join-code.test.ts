import { describe, expect, it } from "vitest";

import {
  digestJoinCode,
  generateJoinCode,
  normalizeJoinCode,
  verifyJoinCode,
} from "./join-code";

const secret = "test-secret-with-at-least-32-characters";

describe("join codes", () => {
  it("generates eight-character unambiguous codes", () => {
    for (let index = 0; index < 100; index += 1) {
      expect(generateJoinCode()).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);
    }
  });

  it("normalizes surrounding whitespace and letter case", () => {
    expect(normalizeJoinCode("  abcd2345  ")).toBe("ABCD2345");
  });

  it("does not store the readable code as its digest", () => {
    expect(digestJoinCode("ABCD2345", secret)).not.toBe("ABCD2345");
  });

  it("verifies the correct code", () => {
    const digest = digestJoinCode("ABCD2345", secret);

    expect(verifyJoinCode("ABCD2345", digest, secret)).toBe(true);
  });

  it("verifies a normalized version of the correct code", () => {
    const digest = digestJoinCode("ABCD2345", secret);

    expect(verifyJoinCode("  abcd2345  ", digest, secret)).toBe(true);
  });

  it("rejects incorrect, ambiguous, or malformed codes", () => {
    const digest = digestJoinCode("ABCD2345", secret);

    expect(verifyJoinCode("ZZZZZZZZ", digest, secret)).toBe(false);
    expect(verifyJoinCode("ABCDO345", digest, secret)).toBe(false);
    expect(verifyJoinCode("123456", digest, secret)).toBe(false);
  });
});
