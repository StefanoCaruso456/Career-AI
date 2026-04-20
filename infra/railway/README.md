# Railway deployment — monorepo

Each deployable runs as its own Railway service inside one Railway project. Because this repo uses npm workspaces, every service needs `npm install` at the repo root (not in its own folder) so workspace symlinks resolve correctly.

## Services to configure on Railway

Each service's build/start config lives in its own `railway.toml`. Point each Railway service's **Config-as-Code Path** at the right file (Settings → Config-as-Code → Config Path). Without this, Railway reads the root `railway.toml` (the web service's config) and applies it to every service.

| Railway service | Root directory | Config-as-Code Path                    | Health path      |
| --------------- | -------------- | -------------------------------------- | ---------------- |
| `web`           | `.`            | `railway.toml` (repo root — default)   | `/api/v1/health` |
| `api-gateway`   | `.`            | `services/api-gateway/railway.toml`    | `/v1/health`     |
| `pdf-extractor` | `.`            | `services/pdf-extractor/railway.toml`  | `/v1/health`     |

api-gateway now includes the document-verification logic in-process, so there's no separate `document-verifier` service to deploy. It still calls pdf-extractor over HTTP (that one stays separate — it parses untrusted PDF binaries and deserves an isolation boundary).

## Why rootDirectory = `.` for every service

npm workspaces symlink workspace deps into the **root** `node_modules`. If Railway sets rootDirectory to, say, `services/api-gateway`, the build will run `npm install` there and fail to resolve `@career-ledger/pdf-signature-verifier` because the symlink lives at the repo root.

Watch paths can still be per-service in Railway's config (so a change under `services/pdf-extractor/` only redeploys that service). Set those in the Railway dashboard.

## Environment variables

Each service reads from its own `.env.example`. For Railway, mirror those into the service's Variables tab. Shared config (DATABASE_URL, INTERNAL_API_TOKENS, etc.) should live on the Railway project-level env or be referenced via Railway's shared-variables feature.

## Postgres

Local dev uses `infra/docker-compose.yml` on port `5433`. In Railway, add a Postgres plugin to the project and wire `${{Postgres.DATABASE_URL}}` into each service's Variables.

## Notes

- The root `railway.toml` is the `web` service config. It now builds from `Dockerfile.web` so Playwright's browser binaries and Linux shared libraries are present for one-click apply. Set Config Path to it for the `web` service only.
- Service-local `railway.toml` files now exist under `services/*/railway.toml`. Each specifies the correct workspace-aware build and start commands. Railway only picks these up when the service's Config Path points at them.
- api-gateway's `railway.toml` runs `db:migrate` before `start` because api-gateway doesn't auto-migrate on boot (Career-AI does; that's why the root config includes it).
