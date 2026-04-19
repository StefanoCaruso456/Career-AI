import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { ApiError } from "@/packages/contracts/src";
import {
  createPersistentCredentialUser,
  findPersistentCredentialUserByEmail,
  recordPersistentUserLogin,
  type PersistentCredentialUserRecord,
} from "@/packages/persistence/src";

export type CredentialUser = PersistentCredentialUserRecord;

export class CredentialUserConflictError extends Error {
  constructor(message = "An account with this email already exists.") {
    super(message);
    this.name = "CredentialUserConflictError";
  }
}

export class CredentialUserValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CredentialUserValidationError";
  }
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function normalizeName(name: string) {
  return name.replace(/\s+/g, " ").trim();
}

function derivePasswordHash(password: string, salt: string) {
  return scryptSync(password, salt, 64).toString("hex");
}

function hashesMatch(leftHash: string, rightHash: string) {
  const left = Buffer.from(leftHash, "hex");
  const right = Buffer.from(rightHash, "hex");

  if (left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(left, right);
}

function deriveNameParts(name: string) {
  const normalizedName = normalizeName(name);
  const [firstName, ...rest] = normalizedName.split(" ");

  return {
    firstName: firstName || "Career",
    fullName: normalizedName,
    lastName: rest.join(" ").trim() || "Member",
  };
}

export async function findCredentialUserByEmail(email: string) {
  return findPersistentCredentialUserByEmail({
    email,
  });
}

export async function createCredentialUser(args: {
  email: string;
  name: string;
  password: string;
}) {
  const normalizedName = normalizeName(args.name);
  const password = args.password;

  if (!normalizedName) {
    throw new CredentialUserValidationError("Please enter your full name.");
  }

  if (password.length < 8) {
    throw new CredentialUserValidationError("Password must be at least 8 characters.");
  }

  const { firstName, fullName, lastName } = deriveNameParts(normalizedName);
  const passwordSalt = randomBytes(16).toString("hex");
  const passwordHash = derivePasswordHash(password, passwordSalt);

  try {
    return await createPersistentCredentialUser({
      correlationId: `credential_signup_${randomUUID()}`,
      email: normalizeEmail(args.email),
      firstName,
      fullName,
      lastName,
      passwordHash,
      passwordSalt,
    });
  } catch (error) {
    if (error instanceof ApiError && error.errorCode === "CONFLICT") {
      throw new CredentialUserConflictError(error.message);
    }

    throw error;
  }
}

export async function recordCredentialSignIn(userId: string) {
  await recordPersistentUserLogin({
    userId,
  });
}

export function verifyCredentialPassword(user: CredentialUser, password: string) {
  if (!password) {
    return false;
  }

  const passwordHash = derivePasswordHash(password, user.passwordSalt);
  return hashesMatch(passwordHash, user.passwordHash);
}
