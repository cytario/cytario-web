# syntax=docker/dockerfile:1.28@sha256:bb22d9815c728170f72750f4e5b0d672e06176142e1d602c7e66c050100b7e5b
#
# In-tree image build. Uses the same `cytario-web` CLI (build, then
# start) that downstream consumers run. Builder stages are pinned to
# Debian bookworm so the Prisma engine target (debian-openssl-3.0.x)
# downloaded by `npm ci` matches the distroless runtime (bookworm and
# trixie both resolve to debian-openssl-3.0.x).
#
# -- deps stage: install npm dependencies -------
#
FROM node:24-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205 AS deps
ENV HUSKY=0

WORKDIR /app
COPY package.json package-lock.json ./
# Workspace package.json files are needed before `npm ci` so the
# workspace symlinks resolve (see packages/* in root package.json#workspaces).
COPY packages ./packages
COPY prisma ./prisma
RUN --mount=type=cache,target=/root/.npm npm ci

#
# -- build stage: compile the app ---------------
#
FROM node:24-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205 AS build
ENV HUSKY=0

WORKDIR /app
COPY package.json package-lock.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# `cytario-web build` runs `prisma generate`, the plugin codegen, then
# `react-router build`. CYTARIO_PLUGINS is unset in this repo, so the
# codegen emits the empty canonical `app/plugins.generated.ts`.
RUN node bin/cytario-web.mjs build
# Emit `server.js` for the runtime stage — Node 24 won't type-strip
# under `node_modules/`.
RUN npm run build:server

#
# -- prod-deps stage: production-only node_modules ----
# Distroless has no npm, so the runtime node_modules (including the
# Prisma schema engine binary for migrate deploy) is installed here and
# copied in.
#
FROM node:24-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205 AS prod-deps
ENV HUSKY=0

WORKDIR /app
COPY package.json package-lock.json ./
# Workspaces must be present for `npm ci` to install the symlinks.
COPY packages ./packages
COPY prisma.config.ts ./
COPY prisma ./prisma
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev

#
# -- runtime stage: distroless production image ----
# Ships Node 24.22.1 (the debian12 variant is stranded on 24.14.0);
# its libssl3 covers the Prisma engine, no apt layer required.
# Runs as the nonroot user (UID 65532) — the server writes nothing to
# the filesystem at runtime (sessions in Redis, data in Postgres).
#
FROM gcr.io/distroless/nodejs24-debian13:nonroot@sha256:a6c34457f6da4295807e051411c7783739c65b997a324fed14e4fa292615ae91

WORKDIR /app
COPY package.json package-lock.json prisma.config.ts ./
COPY packages ./packages
COPY prisma ./prisma
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY --from=build /app/server.js /app/server.js.map ./
# Bin must sit next to server.js so the CLI resolves PACKAGE_ROOT correctly.
COPY bin ./bin

# Copy static files directly from source
COPY public ./public

# Node entrypoint replaces the shell script — distroless has no shell.
COPY docker-entrypoint.mjs ./

ARG VERSION
ENV VERSION=$VERSION
ARG COMMIT_SHA
ENV COMMIT_SHA=$COMMIT_SHA

EXPOSE 3000
# The distroless nodejs image's implicit entrypoint is node; override it
# to run the migration+start wrapper, with the start command as CMD.
ENTRYPOINT ["/nodejs/bin/node", "docker-entrypoint.mjs"]
CMD ["bin/cytario-web.mjs", "start"]
