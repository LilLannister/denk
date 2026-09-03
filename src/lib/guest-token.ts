import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const GUEST_TOKEN_BYTES = 32;

export function generateGuestToken() {
  return randomBytes(GUEST_TOKEN_BYTES).toString("base64url");
}

export function hashGuestToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function verifyGuestToken(token: string, expectedHash: string) {
  const actualHash = Buffer.from(hashGuestToken(token), "hex");
  const storedHash = Buffer.from(expectedHash, "hex");

  return (
    actualHash.length === storedHash.length &&
    timingSafeEqual(actualHash, storedHash)
  );
}
