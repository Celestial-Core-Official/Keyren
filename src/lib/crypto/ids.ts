import { randomAlphabetString } from "./random";

/**
 * 26 Crockford symbols = 130 bits of entropy, comfortably above the 128-bit
 * floor. These IDs are immutable for the lifetime of the resource: renaming a
 * product must never change its ID, because customer software has it compiled
 * in. Nothing here derives from the name, the slug, a timestamp, or a counter.
 */
const ID_RANDOM_LENGTH = 26;

export function generateProductId(): string {
  return `prod_${randomAlphabetString(ID_RANDOM_LENGTH)}`;
}

export function generateLicenseId(): string {
  return `lic_${randomAlphabetString(ID_RANDOM_LENGTH)}`;
}

export function generateActivationId(): string {
  return `act_${randomAlphabetString(ID_RANDOM_LENGTH)}`;
}
