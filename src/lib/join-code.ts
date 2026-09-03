import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

const JOIN_CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const JOIN_CODE_LENGTH = 8;
const JOIN_CODE_PATTERN = /^[0-9A-HJKMNP-TV-Z]{8}$/;

export function normalizeJoinCode(joinCode: string) {
  return joinCode.trim().toUpperCase();
}

export function isJoinCode(joinCode: string) {
  return JOIN_CODE_PATTERN.test(normalizeJoinCode(joinCode));
}

export function generateJoinCode() {
  return Array.from(
    { length: JOIN_CODE_LENGTH },
    () => JOIN_CODE_ALPHABET[randomInt(JOIN_CODE_ALPHABET.length)],
  ).join("");
}

export function digestJoinCode(joinCode: string, secret: string) {
  return createHmac("sha256", secret)
    .update(normalizeJoinCode(joinCode))
    .digest("hex");
}

export function verifyJoinCode(
  joinCode: string,
  expectedDigest: string,
  secret: string,
) {
  const normalizedJoinCode = normalizeJoinCode(joinCode);

  if (!isJoinCode(normalizedJoinCode)) {
    return false;
  }

  const actualDigest = Buffer.from(
    digestJoinCode(normalizedJoinCode, secret),
    "hex",
  );
  const storedDigest = Buffer.from(expectedDigest, "hex");

  return (
    actualDigest.length === storedDigest.length &&
    timingSafeEqual(actualDigest, storedDigest)
  );
}
