# Railway deployment — monorepo

Each deployable runs as its own Railway service inside one Railway project. Because this repo uses npm workspaces, every service needs `npm install` at the repo root (not in its own folder) so workspace symlinks resolve correctly.

## Services to configure on Railway

| Railway service  | Root directory | Build command                                     | Start command                                      | Health path    |
| ---------------- | -------------- | ------------------------------------------------- | -------------------------------------------------- | -------------- |
| `web`            | `.`            | `npm install && npm run build`                    | `npm run db:migrate && npm run start`              | `/api/v1/health` |
| `api-gateway`    | `.`            | `npm install && npm run build:gateway`            | `npm --workspace services/api-gateway run start`   | `/v1/health`   |
| `document-verifier` | `.`         | `npm install && npm run build:verifier`           | `npm --workspace services/document-verifier run start` | `/v1/health` |
| `pdf-extractor`  | `.`            | `npm install && npm run build:extractor`          | `npm --workspace services/pdf-extractor run start` | `/v1/health`   |

## Why rootDirectory = `.` for every service

npm workspaces symlink workspace deps into the **root** `node_modules`. If Railway sets rootDirectory to, say, `services/api-gateway`, the build will run `npm install` there and fail to resolve `@career-ledger/pdf-signature-verifier` because the symlink lives at the repo root.

Watch paths can still be per-service in Railway's config (so a change under `services/document-verifier/` only redeploys that service). Set those in the Railway dashboard.

## Environment variables

Each service reads from its own `.env.example`. For Railway, mirror those into the service's Variables tab. Shared config (DATABASE_URL, INTERNAL_API_TOKENS, etc.) should live on the Railway project-level env or be referenced via Railway's shared-variables feature.

## Postgres

Local dev uses `infra/docker-compose.yml` on port `5433`. In Railway, add a Postgres plugin to the project and wire `${{Postgres.DATABASE_URL}}` into each service's Variables.

## Notes

- `web/railway.toml` exists at the repo root as a legacy config from when Career-AI was its own repo. It still works for the `web` Railway service; the config in this table is a cleaned-up reference for when someone reconfigures Railway from scratch.
- Service-local `railway.toml` files are intentionally **not** added — they'd be overridden by the root-directory / watch-path setup anyway, and keeping config centralized here avoids drift.
