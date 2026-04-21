# Railway Notes

The repo currently has three Railway config files:

- root `railway.toml` for the main Next.js app
- `services/api-gateway/railway.toml`
- `services/pdf-extractor/railway.toml`

When deploying the service workspaces on Railway, point each Railway service at its own config file instead of reusing the root config.
