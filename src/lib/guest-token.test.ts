import { describe, expect, it } from "vitest";

import {
  generateGuestToken,
  hashGuestToken,
  verifyGuestToken,
} from "./guest-token";

describe("guest tokens", () => {
  it("generates strong URL-safe random tokens", () => {
    const token = generateGuestToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("does not store the readable token as its hash", () => {
    const token = generateGuestToken();

    expect(hashGuestToken(token)).not.toBe(token);
  });

  it("verifies the correct token", () => {
    const token = generateGuestToken();
    const tokenHash = hashGuestToken(token);

    expect(verifyGuestToken(token, tokenHash)).toBe(true);
  });

  it("rejects an incorrect token", () => {
    const tokenHash = hashGuestToken(generateGuestToken());

    expect(verifyGuestToken(generateGuestToken(), tokenHash)).toBe(false);
  });
});
