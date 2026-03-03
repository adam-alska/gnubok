# Self-Hosting gnubok with Docker

## Prerequisites

- Docker and Docker Compose (v2)
- A [Supabase](https://supabase.com) project (free tier works)

You do **not** need Node.js, npm, or anything else installed locally. The pre-built image has everything.

---

## Quick Start

### 1. Download the required files

```bash
mkdir gnubok && cd gnubok

# Compose file + env template
curl -fsSLO https://raw.githubusercontent.com/gnubok/gnubok/main/docker-compose.yml
curl -fsSLO https://raw.githubusercontent.com/gnubok/gnubok/main/.env.docker.example

# Cron sidecar (Dockerfile + schedule)
mkdir -p docker
curl -fsSL -o docker/cron.Dockerfile \
  https://raw.githubusercontent.com/gnubok/gnubok/main/docker/cron.Dockerfile
curl -fsSL -o docker/crontab.self-hosted \
  https://raw.githubusercontent.com/gnubok/gnubok/main/docker/crontab.self-hosted
```

### 2. Configure your environment

```bash
cp .env.docker.example .env
```

Open `.env` and fill in the **required** values:

| Variable | Where to find it |
|----------|-----------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase dashboard → Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase dashboard → Settings → API → `anon` `public` key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase dashboard → Settings → API → `service_role` key |
| `NEXT_PUBLIC_APP_URL` | The URL where you'll access gnubok (e.g. `https://gnubok.example.com`) |
| `CRON_SECRET` | Any random string — `openssl rand -hex 32` works |

### 3. Start

```bash
docker compose up -d
```

That's it. The app is now running at `http://localhost:3000` (or whatever port you set with `PORT`).

### 4. Verify

```bash
# Should return {"status":"healthy",...}
curl http://localhost:3000/api/health
```

---

## Optional Extensions

The self-hosted image ships with all extensions enabled (except Enable Banking, which requires private PSD2 credentials). Each extension activates when you provide its env vars — without them, the app works normally and the feature is simply unavailable.

### AI Features (ai-categorization, ai-chat, receipt-ocr, invoice-inbox)

```env
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
```

### Email (invoice sending, reminders)

```env
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=faktura@your-domain.com
RESEND_WEBHOOK_SECRET=whsec_...
```

### Push Notifications

```env
NEXT_PUBLIC_VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:you@example.com
```

Generate VAPID keys with: `npx web-push generate-vapid-keys`

### Calendar

No env vars needed — always available.

---

## Updating

```bash
docker compose pull        # pulls latest app image from GHCR
docker compose up -d       # recreates containers if image changed
```

The `latest` tag always points to the newest build from `main`. The cron sidecar is a small Alpine image built locally — it updates automatically on `up` if you re-download `docker/cron.Dockerfile`.

---

## Building from Source

If you prefer to build locally instead of pulling the pre-built image:

```bash
# Clone the repo
git clone https://github.com/gnubok/gnubok.git
cd gnubok
cp .env.docker.example .env
# Fill in .env

# Build and start
docker compose -f docker-compose.yml -f docker-compose.build.yml up --build -d
```

---

## Architecture

The compose setup runs two containers:

| Container | What it does |
|-----------|-------------|
| `app` | Next.js application server |
| `cron` | Lightweight Alpine sidecar that runs scheduled jobs (deadline checks, invoice reminders, tax deadline sync, document verification) via [supercronic](https://github.com/aptible/supercronic) |

The cron container waits for the app's healthcheck to pass before starting. It calls the app's cron API endpoints over the internal Docker network.

### How NEXT_PUBLIC_* injection works

The Docker image is built with placeholder values (e.g. `__NEXT_PUBLIC_SUPABASE_URL__`) baked into the JavaScript bundles. When the container starts, `docker-entrypoint.sh` replaces those placeholders with your actual env vars via `sed`. This means the same image works for any Supabase project — no rebuilding needed.

---

## Ports

The app listens on port 3000 inside the container. To map it to a different host port:

```env
PORT=8080
```

Then access at `http://localhost:8080`.

---

## Reverse Proxy

For production, put the app behind a reverse proxy (nginx, Caddy, Traefik) that handles TLS. Example with Caddy:

```
gnubok.example.com {
    reverse_proxy localhost:3000
}
```

Make sure `NEXT_PUBLIC_APP_URL` matches the public URL (e.g. `https://gnubok.example.com`).

---

## Troubleshooting

**Container exits immediately**
```bash
docker compose logs app
```
Most common cause: missing required env vars. Check that all 5 required values in `.env` are set.

**Health check fails**
```bash
curl -v http://localhost:3000/api/health
```
The health endpoint tests database connectivity. If it returns `unhealthy`, verify your Supabase URL and service role key are correct.

**Cron container keeps restarting**
```bash
docker compose logs cron
```
The cron container depends on the app being healthy first. If the app never becomes healthy, the cron container will wait indefinitely.

**Port already in use**
Set a different port: `PORT=8080 docker compose up -d`
