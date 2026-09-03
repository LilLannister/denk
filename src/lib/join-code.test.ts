import { describe, expect, it } from "vitest";

import { digestJoinCode, generateJoinCode, verifyJoinCode } from "./join-code";

const secret = "test-secret-with-at-least-32-characters";

describe("join codes", () => {
  it("generates six-digit codes", () => {
    for (let index = 0; index < 100; index += 1) {
      expect(generateJoinCode()).toMatch(/^\d{6}$/);
    }
  });

  it("does not store the readable code as its digest", () => {
    expect(digestJoinCode("123456", secret)).not.toBe("123456");
  });

  it("verifies the correct code", () => {
    const digest = digestJoinCode("123456", secret);

    expect(verifyJoinCode("123456", digest, secret)).toBe(true);
  });

  it("rejects an incorrect or malformed code", () => {
    const digest = digestJoinCode("123456", secret);

    expect(verifyJoinCode("654321", digest, secret)).toBe(false);
    expect(verifyJoinCode("12345", digest, secret)).toBe(false);
    expect(verifyJoinCode("abcdef", digest, secret)).toBe(false);
  });
});
