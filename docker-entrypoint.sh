#!/bin/sh
set -e

# ─── Validate required environment variables ───
missing=""
for var in NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY NEXT_PUBLIC_APP_URL CRON_SECRET; do
  eval val=\$$var
  if [ -z "$val" ]; then
    missing="$missing  - $var\n"
  fi
done

if [ -n "$missing" ]; then
  printf "ERROR: Missing required environment variables:\n%b\nSee .env.docker.example for reference.\n" "$missing" >&2
  exit 1
fi

# Warn if placeholder values are still set
placeholders_found=""
case "$NEXT_PUBLIC_SUPABASE_ANON_KEY" in *your-anon-key*) placeholders_found="$placeholders_found  - NEXT_PUBLIC_SUPABASE_ANON_KEY\n" ;; esac
case "$SUPABASE_SERVICE_ROLE_KEY" in *your-service-role-key*) placeholders_found="$placeholders_found  - SUPABASE_SERVICE_ROLE_KEY\n" ;; esac
case "$NEXT_PUBLIC_SUPABASE_URL" in *your-project*) placeholders_found="$placeholders_found  - NEXT_PUBLIC_SUPABASE_URL\n" ;; esac
case "$NEXT_PUBLIC_APP_URL" in *your-domain*) placeholders_found="$placeholders_found  - NEXT_PUBLIC_APP_URL\n" ;; esac
case "$CRON_SECRET" in *generate-a-random-secret*) placeholders_found="$placeholders_found  - CRON_SECRET\n" ;; esac

if [ -n "$placeholders_found" ]; then
  printf "WARNING: These variables appear to contain placeholder values:\n%bPlease set them to real values before running in production.\n" "$placeholders_found" >&2
fi

# Replace build-time placeholder sentinels with runtime env vars.
# This allows a single pre-built image to work with any Supabase project.
# Client-side bundles:
if [ -d /app/.next/static ]; then
  find /app/.next/static -name '*.js' -exec sed -i \
    -e "s|__NEXT_PUBLIC_SUPABASE_URL__|${NEXT_PUBLIC_SUPABASE_URL}|g" \
    -e "s|__NEXT_PUBLIC_SUPABASE_ANON_KEY__|${NEXT_PUBLIC_SUPABASE_ANON_KEY}|g" \
    -e "s|__NEXT_PUBLIC_APP_URL__|${NEXT_PUBLIC_APP_URL}|g" \
    -e "s|__NEXT_PUBLIC_VAPID_PUBLIC_KEY__|${NEXT_PUBLIC_VAPID_PUBLIC_KEY:-}|g" \
    -e "s|__NEXT_PUBLIC_SELF_HOSTED__|${NEXT_PUBLIC_SELF_HOSTED:-true}|g" \
    -e "s|__NEXT_PUBLIC_REQUIRE_MFA__|${NEXT_PUBLIC_REQUIRE_MFA:-false}|g" \
    {} +
fi

# Server-side bundles (Next.js inlines NEXT_PUBLIC_* at build time here too):
if [ -d /app/.next/server ]; then
  find /app/.next/server -name '*.js' -exec sed -i \
    -e "s|__NEXT_PUBLIC_SUPABASE_URL__|${NEXT_PUBLIC_SUPABASE_URL}|g" \
    -e "s|__NEXT_PUBLIC_SUPABASE_ANON_KEY__|${NEXT_PUBLIC_SUPABASE_ANON_KEY}|g" \
    -e "s|__NEXT_PUBLIC_APP_URL__|${NEXT_PUBLIC_APP_URL}|g" \
    -e "s|__NEXT_PUBLIC_VAPID_PUBLIC_KEY__|${NEXT_PUBLIC_VAPID_PUBLIC_KEY:-}|g" \
    -e "s|__NEXT_PUBLIC_SELF_HOSTED__|${NEXT_PUBLIC_SELF_HOSTED:-true}|g" \
    -e "s|__NEXT_PUBLIC_REQUIRE_MFA__|${NEXT_PUBLIC_REQUIRE_MFA:-false}|g" \
    {} +
fi

# Also replace in the standalone server.js entry point:
if [ -f /app/server.js ]; then
  sed -i \
    -e "s|__NEXT_PUBLIC_SUPABASE_URL__|${NEXT_PUBLIC_SUPABASE_URL}|g" \
    -e "s|__NEXT_PUBLIC_SUPABASE_ANON_KEY__|${NEXT_PUBLIC_SUPABASE_ANON_KEY}|g" \
    -e "s|__NEXT_PUBLIC_APP_URL__|${NEXT_PUBLIC_APP_URL}|g" \
    -e "s|__NEXT_PUBLIC_VAPID_PUBLIC_KEY__|${NEXT_PUBLIC_VAPID_PUBLIC_KEY:-}|g" \
    -e "s|__NEXT_PUBLIC_SELF_HOSTED__|${NEXT_PUBLIC_SELF_HOSTED:-true}|g" \
    -e "s|__NEXT_PUBLIC_REQUIRE_MFA__|${NEXT_PUBLIC_REQUIRE_MFA:-false}|g" \
    /app/server.js
fi

exec "$@"
