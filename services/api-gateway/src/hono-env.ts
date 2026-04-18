/**
 * Shared Hono environment types used by all routes and middleware.
 */

export interface AppVariables {
  actorDid: string;
  correlationId: string;
}

export type AppEnv = {
  Variables: AppVariables;
};
