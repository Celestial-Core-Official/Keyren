import { randomBytes } from "node:crypto";

/**
 * Crockford Base32. Deliberately 32 symbols long, and deliberately without
 * I, L, O or U — the first three are visually ambiguous when a human reads a
 * license key off a screen, and excluding U avoids accidental profanity.
 *
 * The length is load-bearing: 256 is an exact multiple of 32, so reducing a
 * uniform random byte with `% 32` stays uniform. Changing this string's
 * length would silently introduce modulo bias, which is why a test asserts it.
 */
export const CROCKFORD_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function randomAlphabetString(length: number): string {
  if (!Number.isInteger(length) || length <= 0) {
    throw new Error("randomAlphabetString: length must be a positive integer");
  }

  const bytes = randomBytes(length);
  let out = "";

  for (let i = 0; i < length; i += 1) {
    // Non-null assertion is unnecessary: randomBytes(length) guarantees
    // `length` bytes, and we index strictly below it.
    const byte = bytes[i] as number;
    out += CROCKFORD_ALPHABET[byte % CROCKFORD_ALPHABET.length];
  }

  return out;
}
