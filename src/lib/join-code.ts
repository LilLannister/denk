import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

const JOIN_CODE_LIMIT = 1_000_000;
const JOIN_CODE_PATTERN = /^\d{6}$/;

export function generateJoinCode() {
  return randomInt(JOIN_CODE_LIMIT).toString().padStart(6, "0");
}

export function digestJoinCode(joinCode: string, secret: string) {
  return createHmac("sha256", secret).update(joinCode).digest("hex");
}

export function verifyJoinCode(
  joinCode: string,
  expectedDigest: string,
  secret: string,
) {
  if (!JOIN_CODE_PATTERN.test(joinCode)) {
    return false;
  }

  const actualDigest = Buffer.from(digestJoinCode(joinCode, secret), "hex");
  const storedDigest = Buffer.from(expectedDigest, "hex");

  return (
    actualDigest.length === storedDigest.length &&
    timingSafeEqual(actualDigest, storedDigest)
  );
}
