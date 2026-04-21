# Services

The repo currently contains two standalone service workspaces:

- `services/api-gateway`: optional Hono gateway for synchronous claim verification used by Career Builder when `API_GATEWAY_URL` and `GATEWAY_SHARED_SECRET` are configured.
- `services/pdf-extractor`: PDF parsing service used by `api-gateway`.

There are no other implemented service workspaces in this repository today.
