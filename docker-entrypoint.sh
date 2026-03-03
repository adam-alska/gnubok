#!/bin/sh
set -e

# Replace build-time placeholder sentinels with runtime env vars in static JS bundles.
# This allows a single pre-built image to work with any Supabase project.
if [ -d /app/.next/static ]; then
  find /app/.next/static -name '*.js' -exec sed -i \
    -e "s|__NEXT_PUBLIC_SUPABASE_URL__|${NEXT_PUBLIC_SUPABASE_URL}|g" \
    -e "s|__NEXT_PUBLIC_SUPABASE_ANON_KEY__|${NEXT_PUBLIC_SUPABASE_ANON_KEY}|g" \
    -e "s|__NEXT_PUBLIC_APP_URL__|${NEXT_PUBLIC_APP_URL}|g" \
    -e "s|__NEXT_PUBLIC_VAPID_PUBLIC_KEY__|${NEXT_PUBLIC_VAPID_PUBLIC_KEY:-}|g" \
    {} +
fi

exec "$@"
