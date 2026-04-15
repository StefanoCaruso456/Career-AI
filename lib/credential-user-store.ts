import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { promises as fs } from "node:fs";
import { z } from "zod";

const credentialUserSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email(),
  passwordHash: z.string().min(1),
  passwordSalt: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const credentialStoreSchema = z.object({
  users: z.array(credentialUserSchema),
});

type CredentialStore = z.infer<typeof credentialStoreSchema>;

export type CredentialUser = z.infer<typeof credentialUserSchema>;
let credentialStoreWriteChain: Promise<unknown> = Promise.resolve();

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

const credentialStoreDirectory = ".artifacts";
const credentialStorePath = `${credentialStoreDirectory}/auth-users.json`;

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
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

async function readStore(): Promise<CredentialStore> {
  try {
    const fileContents = await fs.readFile(credentialStorePath, "utf8");
    return credentialStoreSchema.parse(JSON.parse(fileContents));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { users: [] };
    }

    throw error;
  }
}

async function writeStore(store: CredentialStore) {
  await fs.mkdir(credentialStoreDirectory, { recursive: true });
  await fs.writeFile(credentialStorePath, JSON.stringify(store, null, 2), "utf8");
}

function withCredentialStoreWriteLock<T>(task: () => Promise<T>) {
  const runTask = credentialStoreWriteChain.then(task, task);
  credentialStoreWriteChain = runTask.then(
    () => undefined,
    () => undefined,
  );

  return runTask;
}

export async function findCredentialUserByEmail(email: string) {
  const normalizedEmail = normalizeEmail(email);
  const store = await readStore();

  return store.users.find((user) => user.email === normalizedEmail) ?? null;
}

export async function createCredentialUser(args: {
  email: string;
  name: string;
  password: string;
}) {
  const normalizedEmail = normalizeEmail(args.email);
  const normalizedName = args.name.trim();
  const password = args.password;

  if (!normalizedName) {
    throw new CredentialUserValidationError("Please enter your full name.");
  }

  if (password.length < 8) {
    throw new CredentialUserValidationError("Password must be at least 8 characters.");
  }

  return withCredentialStoreWriteLock(async () => {
    const store = await readStore();
    const existingUser = store.users.find((user) => user.email === normalizedEmail);

    if (existingUser) {
      throw new CredentialUserConflictError();
    }

    const now = new Date().toISOString();
    const passwordSalt = randomBytes(16).toString("hex");
    const user: CredentialUser = {
      id: `usr_${randomUUID()}`,
      name: normalizedName,
      email: normalizedEmail,
      passwordSalt,
      passwordHash: derivePasswordHash(password, passwordSalt),
      createdAt: now,
      updatedAt: now,
    };

    store.users.push(user);
    await writeStore(store);

    return user;
  });
}

export function verifyCredentialPassword(user: CredentialUser, password: string) {
  if (!password) {
    return false;
  }

  const passwordHash = derivePasswordHash(password, user.passwordSalt);
  return hashesMatch(passwordHash, user.passwordHash);
}
