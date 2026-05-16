# syntax=docker/dockerfile:1.7
#
# In-tree image build. Uses the same `cytario-web` CLI (build, then
# start) that downstream consumers run. Adds a separate `deps` stage
# to cache the registry install and a runtime stage that trims
# devDependencies.
#
# -- deps stage: install npm dependencies -------
#
FROM node:24-slim AS deps
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
FROM node:24-slim AS build
ENV HUSKY=0

WORKDIR /app
COPY package.json package-lock.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# `cytario-web build` runs `prisma generate`, the plugin codegen, then
# `react-router build`. CYTARIO_PLUGINS is unset in this repo, so the
# codegen emits the empty canonical `app/plugins.generated.ts`.
RUN node bin/cytario-web.mjs build

#
# -- runtime stage: minimal production image ----
#
FROM node:24-slim
ENV HUSKY=0

RUN apt-get update && apt-get install -y \
    openssl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
# Workspaces must be present for `npm ci` to install the symlinks.
COPY packages ./packages
COPY prisma.config.ts ./
COPY prisma ./prisma
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev
COPY --from=build /app/build ./build
COPY server.ts ./
# Runtime entry point — must sit next to server.ts so the CLI
# resolves the package root correctly.
COPY bin ./bin

# Copy static files directly from source
COPY public ./public

# Copy and set up entrypoint script
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ARG VERSION
ENV VERSION=$VERSION
ARG COMMIT_SHA
ENV COMMIT_SHA=$COMMIT_SHA

EXPOSE 3000
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "bin/cytario-web.mjs", "start"]
