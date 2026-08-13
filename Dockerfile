# syntax=docker/dockerfile:1
#
# Four stages. The point of the split: `deps` installs once and is reused by both the
# build and the migrate paths, and the image that actually runs in production (`runner`)
# never sees devDependencies, drizzle-kit, or source outside what `next build` traced.

# ---------------------------------------------------------------------------
# deps — full install (incl. devDependencies), reused below so nothing installs twice
# ---------------------------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app
# node:22-alpine ships npm 10.9.8, which mis-serializes an optional peer dep vitest pulls
# in (a nested esbuild satisfying vite's optional peerDependency) — its own platform
# binaries lose their `optional` flag in package-lock.json's "packages" tree, and `npm
# ci` then hard-fails on an unrelated platform (aix-ppc64) instead of skipping it. Fixed
# in npm 12. Bumping here, once, is cheaper than hand-patching the lockfile every time
# someone runs `npm install` on macOS.
RUN npm install -g npm@12
COPY package.json package-lock.json ./
RUN npm ci

# ---------------------------------------------------------------------------
# builder — compiles the Next.js standalone server
# ---------------------------------------------------------------------------
FROM node:22-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---------------------------------------------------------------------------
# migrator — schema push, RLS policies, optional seed. Runs once as a one-shot compose
# service and exits; it is what keeps drizzle-kit/tsx/psql out of the runtime image
# without a second npm install.
# ---------------------------------------------------------------------------
FROM node:22-alpine AS migrator
RUN apk add --no-cache postgresql-client
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json drizzle.config.ts ./
COPY drizzle ./drizzle
COPY src ./src
COPY scripts ./scripts
COPY docker/migrate-entrypoint.sh /migrate-entrypoint.sh
RUN chmod +x /migrate-entrypoint.sh
ENTRYPOINT ["/migrate-entrypoint.sh"]

# ---------------------------------------------------------------------------
# runner — the production image. No devDependencies, no compiler, no source beyond
# what Next traced into .next/standalone. Runs as a non-root user.
# ---------------------------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup -S nodejs && adduser -S nextjs -G nodejs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
