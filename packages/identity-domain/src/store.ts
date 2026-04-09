import { resetTestDatabase } from "@/packages/persistence/src/test-helpers";

export async function resetIdentityStore() {
  await resetTestDatabase();
}
