# Edge Wood ERP — production image (Next.js standalone output)
# Build from repo root:  docker build -f docker/Dockerfile -t edge-erp .

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY packages/i18n/package.json packages/i18n/
RUN npm ci

FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 TZ=Africa/Cairo
# Arabic-capable fonts + Chromium (for PDF generation) with its OS dependencies.
RUN apt-get update \
 && apt-get install -y --no-install-recommends fonts-noto-core fonts-noto-ui-core tzdata ca-certificates \
 && rm -rf /var/lib/apt/lists/*
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
COPY --from=build /app/node_modules/playwright-core ./node_modules/playwright-core
RUN node node_modules/playwright-core/cli.js install --with-deps chromium && rm -rf /var/lib/apt/lists/*
RUN groupadd --system --gid 1001 app && useradd --system --uid 1001 --gid app app
# Standalone server + static assets
COPY --from=build --chown=app:app /app/apps/web/.next/standalone ./
COPY --from=build --chown=app:app /app/apps/web/.next/static ./apps/web/.next/static
# Migration + seed tooling (used by `docker compose run web npm run db:deploy / db:seed`)
COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/packages ./packages
COPY --from=build --chown=app:app /app/package.json ./package.json
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]
