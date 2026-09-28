# Deploy Gatherhall on Coolify

## Scope of this setup

This adds a Docker deployment, **not a Supabase migration**. The existing SQLite-backed demo continues to run temporarily. There is deliberately no database volume in the supplied Compose file.

**Important:** recreating/redeploying the container loses its local accounts, bookings, payments, and sessions. Demo fixtures are seeded again on the next empty-container start. A simple process/container restart preserves the writable layer; replacing the container does not. Do not store real customer data in this deployment until Supabase is integrated.

Demo credentials and automatic demo-owner sign-in are still enabled. Use this deployment as a demo/staging environment, not a production service containing private information. No Supabase secrets are needed yet.

## Recommended: Coolify Dockerfile build pack

1. Add an application using this GitHub repository.
2. Select branch `arena/01a0e5a2-weddingjhall` (or merge it before selecting your deployment branch).
3. Choose the **Dockerfile** build pack.
4. Set the base directory to `/` and Dockerfile location to `/Dockerfile`.
5. Set **Ports Exposes** / application port to **3000**. You do not need a host port mapping; Coolify's reverse proxy handles public traffic.
6. Add your domain with `https://` and let Coolify provision TLS.
7. If configuring a health check in Coolify, use HTTP `GET /healthz`, port `3000`, expected status `200`. The image also includes its own Docker health check.
8. Leave persistent storage empty for this temporary deployment.
9. Deploy. No custom install, build, or start command is needed.

The image builds the React app once and serves its static files and API from one Express process. Browser API requests use relative URLs, so the domain works without CORS or a separate backend URL. Vite's dev server is not running in the container.

### Runtime environment

| Variable | Image default | Purpose |
| --- | --- | --- |
| `NODE_ENV` | `production` | Serves the compiled browser app. Keep this value in Docker. |
| `PORT` | `3000` | HTTP listen port, bound on `0.0.0.0`. Match Coolify's exposed port if changed. |
| `DATA_DIR` | `/app/data` | Temporary location for the current database. Not a Supabase setting. |

Run one replica. The current SQLite database is local to a container and must not be used as a shared database across replicas.

The runtime runs as the unprivileged `node` user (UID/GID 1000). Any custom mount to `DATA_DIR` must be writable by that user. No storage mount is required by this configuration.

## Local Docker smoke test

```sh
docker compose up --build -d
curl --fail http://localhost:3000/healthz
docker compose ps
docker compose logs -f gatherhall
```

Open http://localhost:3000. If port 3000 is occupied:

```sh
APP_PORT=3001 docker compose up --build -d
curl --fail http://localhost:3001/healthz
```

Stop and remove the container (this also discards its temporary database):

```sh
docker compose down
```

Alternatively:

```sh
docker build -t gatherhall .
docker run --rm --name gatherhall -p 3000:3000 gatherhall
```

## Supabase later

No placeholder credentials or nonfunctional Supabase client are added. When ready, migrate the server's database queries, schema, ownership checks, and session storage; import any data you need to preserve; then configure the required secrets in Coolify's runtime environment. Never expose a Supabase service-role key to the browser or bake secrets into the image.

Until that migration is complete, setting a Supabase URL alone will **not** switch the application's storage backend.

## Container behavior

- Multi-stage Node 22 build; dependencies installed with `npm ci`.
- Production dependency installation omits Vite and build tooling.
- Local databases, Git metadata, and `.env` files are excluded from the build context.
- Public health check verifies the process can query the database without exposing data.
- `SIGTERM` / `SIGINT` stops accepting requests, drains existing requests, and closes SQLite; a 10-second deadline prevents hung deployments.
- Coolify should terminate TLS at its proxy; the internal container endpoint remains HTTP.

## Automated pre-deployment checks

```sh
npm ci
npm run test:deployment
```

This builds the frontend and starts an isolated production server using a temporary data directory and free port. It tests static assets, readiness, the full API suite, graceful shutdown, and session/data persistence across process restarts, then removes the test data. It does not replace an actual Docker image build/smoke test.
