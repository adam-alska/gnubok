# ── Stage 1: Base ──
FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat

# ── Stage 2: Dependencies ──
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ── Stage 3: Builder ──
FROM base AS builder
WORKDIR /app

ARG EXTENSIONS_PRESET=self-hosted

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Apply extension preset (must happen before build — prebuild hook
# runs setup:extensions which reads extensions.config.json)
COPY docker/extensions.${EXTENSIONS_PRESET}.json ./extensions.config.json

# NEXT_PUBLIC_* vars get inlined by Next.js at build time.
# Accept real values via ARG (Coolify injects these), fall back to
# sentinel placeholders for generic image builds.
ARG NEXT_PUBLIC_SUPABASE_URL=__NEXT_PUBLIC_SUPABASE_URL__
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY=__NEXT_PUBLIC_SUPABASE_ANON_KEY__
ARG NEXT_PUBLIC_APP_URL=__NEXT_PUBLIC_APP_URL__
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY=__NEXT_PUBLIC_VAPID_PUBLIC_KEY__
ARG NEXT_PUBLIC_SELF_HOSTED=__NEXT_PUBLIC_SELF_HOSTED__
ARG NEXT_PUBLIC_REQUIRE_MFA=__NEXT_PUBLIC_REQUIRE_MFA__

ENV NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
ENV NEXT_PUBLIC_VAPID_PUBLIC_KEY=${NEXT_PUBLIC_VAPID_PUBLIC_KEY}
ENV NEXT_PUBLIC_SELF_HOSTED=${NEXT_PUBLIC_SELF_HOSTED}
ENV NEXT_PUBLIC_REQUIRE_MFA=${NEXT_PUBLIC_REQUIRE_MFA}

ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ── Stage 4: Runner ──
FROM node:22-alpine AS runner
WORKDIR /app

RUN apk add --no-cache curl

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone output
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy entrypoint script
COPY --chmod=755 docker-entrypoint.sh ./docker-entrypoint.sh

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
