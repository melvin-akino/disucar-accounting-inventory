# ── Stage 1: install dependencies ────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY package.json package-lock.json* ./
# npm ci, not npm install: it installs exactly what package-lock.json pins, so an
# image build cannot silently pick up a different version than was tested.
# --legacy-peer-deps is gone with the unused vitest-mock-extended that needed it.
RUN npm ci

# ── Stage 2: build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
# tzdata: Alpine ships no timezone database, so TZ is silently ignored without it.
RUN apk add --no-cache openssl tzdata
ENV TZ=Asia/Manila
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client before building
RUN npx prisma generate

ENV NEXT_TELEMETRY_DISABLED=1
# Cap Node heap so it spills to swap rather than getting OOM-killed on t2.micro (1 GB RAM)
ENV NODE_OPTIONS="--max-old-space-size=896"
RUN npm run build

# ── Stage 3: production runner ───────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
# tzdata: Alpine ships no timezone database, so TZ is silently ignored without it.
RUN apk add --no-cache openssl tzdata

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# The business operates solely in the Philippines. Timestamps are stored in UTC (Prisma
# writes UTC and Postgres stays on UTC); this only sets how the app renders them and how
# local-day boundaries — notably the 11:59:59 morning-activity cutoff — are computed.
ENV TZ=Asia/Manila

RUN addgroup --system --gid 1001 nodejs
RUN adduser  --system --uid 1001 nextjs

# public/ may be empty — mkdir first so COPY never fails on a missing dir
RUN mkdir -p ./public
COPY --from=builder /app/public ./public

# Standalone output bundle
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static    ./.next/static

# Create the uploads directory and give the nextjs user ownership
# This dir is mounted as a Docker volume so files persist across rebuilds.
RUN mkdir -p /app/uploads && chown nextjs:nodejs /app/uploads

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
