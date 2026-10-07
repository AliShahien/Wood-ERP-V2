import { hash, verify } from "@node-rs/argon2";
import { validation } from "../errors";

// OWASP-recommended Argon2id parameters (19 MiB, t=2, p=1).
const ARGON_OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, ARGON_OPTS);
}

export async function verifyPassword(hashValue: string, plain: string): Promise<boolean> {
  try {
    return await verify(hashValue, plain);
  } catch {
    return false;
  }
}

/** Min 8 chars, at least one letter and one digit. */
export function assertPasswordPolicy(plain: string): void {
  if (plain.length < 8 || plain.length > 128 || !/[A-Za-z؀-ۿ]/.test(plain) || !/\d/.test(plain)) {
    throw validation("errors.passwordPolicy", { field: "password" });
  }
}

// A real hash of a random value, used to equalise timing when the username does not exist.
let dummyHash: Promise<string> | null = null;
export function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword(`dummy-${Math.random()}`);
  return dummyHash;
}
