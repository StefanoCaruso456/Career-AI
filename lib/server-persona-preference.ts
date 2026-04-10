import { cookies } from "next/headers";
import type { Persona } from "./personas";
import { getPersona } from "./personas";
import { preferredPersonaCookieName } from "./persona-preference";

export async function getServerPreferredPersona(): Promise<Persona> {
  const cookieStore = await cookies();

  return getPersona(cookieStore.get(preferredPersonaCookieName)?.value);
}
