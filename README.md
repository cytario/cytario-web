# Cytario Web

[![CI](https://github.com/cytario/cytario-web/actions/workflows/ci.yml/badge.svg)](https://github.com/cytario/cytario-web/actions/workflows/ci.yml)
![Test Coverage Badge](badge.svg)
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](LICENSE)
[![GitHub release](https://img.shields.io/github/v/release/cytario/cytario-web)](https://github.com/cytario/cytario-web/releases)
[![Node.js](https://img.shields.io/badge/node-%3E%3D24.10-green.svg)](https://nodejs.org/)
[![GitHub Stars](https://img.shields.io/github/stars/cytario/cytario-web?style=social)](https://github.com/cytario/cytario-web)

A web-based file browser and viewer for scientific imaging data. Cytario Web lets you explore, visualize, and manage large-scale datasets (OME-TIFF, GeoTIFF, Parquet) stored in S3-compatible object storage.

For the hosted product, see [cytario.com](https://www.cytario.com).

![Screenshot](screenshot.png)

## Architecture

| Layer         | Technology                                                                 |
| ------------- | -------------------------------------------------------------------------- |
| Framework     | React Router v7 (SSR), React 19, Vite 6                                    |
| Language      | TypeScript (strict mode)                                                   |
| Visualization | deck.gl, Viv, DuckDB-WASM, Apache Arrow                                    |
| Styling       | Tailwind CSS, [@cytario/design](https://github.com/cytario/cytario-design) |
| Auth          | OAuth 2.0 via Keycloak, STS for S3 credentials                             |
| Database      | PostgreSQL (Prisma ORM), Redis/Valkey (sessions)                           |
| Cloud         | AWS SDK v3 (S3, STS)                                                       |
| CI/CD         | GitHub Actions, semantic-release, GHCR                                     |

## Plugin model

Cytario Web supports third-party plugins that contribute additional image
formats to the viewer. A plugin is a regular npm package whose default
export satisfies the `@cytario/plugin-api` contract (see
`packages/plugin-api/src/`):

```ts
import type { CytarioPlugin } from "@cytario/plugin-api";

const plugin: CytarioPlugin = {
  name: "@vendor/my-loader",
  apiVersion: "^1.0.0",
  register(ctx) {
    // `extension` accepts a string, a string[] of aliases, or a RegExp
    // tested against the URL. See `FormatExtension` in @cytario/plugin-api.
    ctx.formats.register(["myext", "myext.gz"], {
      load: async (url, opts) => {
        const res = await opts.signedFetch(url, { signal: opts.signal });
        // …parse and return { data: Loader, metadata: Image }
      },
      fileTypeMeta: { label: "My Format", icon: "Microscope" },
    });
  },
};

export default plugin;
```

**Loading.** The set of plugins is fixed at build time. The
`CYTARIO_PLUGINS` env var (comma-separated npm package names) drives a
Vite codegen step that writes `app/plugins.generated.ts`; the host
imports that module at startup, calls `plugin.register(ctx)` for each
entry, and hands the plugin a `PluginContext` containing a scoped
`FormatRegistry` and a `Logger`. A plugin can only register handlers
under its own name — the registry rejects cross-plugin extension
collisions.

**Compatibility gate.** Each plugin declares an `apiVersion` semver
range, checked against the host's bundled `@cytario/plugin-api` version
on bootstrap. Mismatched plugins are logged and skipped — the host keeps
running.

**Security boundary.** All S3 traffic flows through the host-supplied
`signedFetch`. Plugin-supplied headers pass through `sanitizeHeaders`
(allowlist: `Range`, `If-None-Match`, `Accept`, `Cache-Control`;
always denied: `Authorization`, `Host`, `Cookie`, `x-amz-*`) before
being merged behind the signed headers, so a plugin cannot override the
SigV4 signature or smuggle credentials.

**Reference.** Built-in OME-TIFF and OME-Zarr handlers in
`app/components/.client/ImageViewer/state/formats/builtins.ts` are
implemented against the same contract. A minimal stub plugin lives in
`__tests__/fixtures/noop-plugin/` and exercises the registry, the
apiVersion gate, and the FILE_TYPE_REGISTRY auto-derivation.

## Using `@cytario/web` as a package

`@cytario/web` can be installed as an npm dependency and assembled into
a deployable container together with one or more format-handler
plugins. This is how **Cytario Enterprise Edition** is built: the
AGPL-licensed open core (`@cytario/web`) is bundled with proprietary
plugins (for example, vendor-specific microscopy format loaders) to
produce a single deployable image. Anyone with a plugin that satisfies
the [`@cytario/plugin-api`](packages/plugin-api/) contract can follow
the same pattern.

> **License obligation.** `@cytario/web` is licensed under
> [AGPL-3.0](LICENSE). Distributing or operating an assembly that
> includes it — including over a network as a service — triggers the
> AGPL's source-disclosure requirement: the complete corresponding
> source of the assembly (including any proprietary plugins linked
> into it) must be made available to its users under AGPL-3.0. If that
> is incompatible with your distribution model, a commercial license is
> available — contact us at [cytario.com](https://www.cytario.com).

The consumer's job is to install the packages, set `CYTARIO_PLUGINS`,
and invoke the bundled CLI:

```sh
# .npmrc — only required if any of the plugins ship from a registry
# other than public npm. The example below routes a hypothetical
# closed plugin to GitHub Packages while keeping @cytario/web and
# @cytario/plugin-api on public npm.
@your-org/closed-plugin:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GH_TOKEN}
```

```sh
npm install @cytario/web @cytario/plugin-api @your-org/my-plugin

# Production build with the bundled plugin set.
CYTARIO_PLUGINS=@your-org/my-plugin npx cytario-web build

# Dev server with HMR.
CYTARIO_PLUGINS=@your-org/my-plugin npx cytario-web dev

# Production server against the existing build/ output.
npx cytario-web start
```

`CYTARIO_PLUGINS` is a comma-separated list of npm package names. Each
package's default export must satisfy the
[`@cytario/plugin-api`](packages/plugin-api/) contract.

### CLI

| Command             | Behaviour                                                                                                |
| ------------------- | -------------------------------------------------------------------------------------------------------- |
| `cytario-web build` | Codegen (Vite plugin reads `CYTARIO_PLUGINS`) + `react-router build` against the installed package root. |
| `cytario-web dev`   | Codegen + `react-router dev`. Extra args (`--port`, `--host`, …) are forwarded.                          |
| `cytario-web start` | `NODE_ENV=production node server.ts` against the bundled `build/server/index.js`.                        |

All subcommands operate against `@cytario/web`'s own install directory;
the consumer never needs to know the on-disk layout.

### Reference Dockerfile

```dockerfile
# syntax=docker/dockerfile:1.7
FROM node:24-slim AS build
WORKDIR /app
COPY .npmrc package.json package-lock.json ./
# BuildKit secret: GH_TOKEN is exposed as an env var only for this
# RUN. It is never written to a layer and never appears in `docker
# history` or `docker inspect`. Do NOT add `ARG GH_TOKEN` — that
# would bake the value into image metadata.
RUN --mount=type=secret,id=gh_token,env=GH_TOKEN \
    npm ci
ENV CYTARIO_PLUGINS=@your-org/my-plugin
RUN npx cytario-web build

FROM node:24-slim
WORKDIR /app
COPY --from=build /app .
ENV NODE_ENV=production
EXPOSE 3000
CMD ["npx", "cytario-web", "start"]
```

Build the image with the BuildKit secret bound from your environment
(or a file):

```sh
# Docker — environment source (e.g. CI runner with a GH_TOKEN secret):
GH_TOKEN=… docker build --secret id=gh_token,env=GH_TOKEN -t my-cytario-image .

# Docker — file source:
docker build --secret id=gh_token,src=./gh_token.txt -t my-cytario-image .

# Podman — only file source is supported (no env= flavor); write the
# token to a temp file first:
printf '%s' "$GH_TOKEN" > /tmp/gh_token && \
    podman build --secret id=gh_token,src=/tmp/gh_token -t my-cytario-image . && \
    rm -f /tmp/gh_token
```

The `# syntax=docker/dockerfile:1.7` parser directive at the top of
the Dockerfile is honored by Docker's BuildKit and silently ignored by
Podman's native parser — the rest of the file (multi-stage,
`--mount=type=cache`, `--mount=type=secret`) works on both engines.

> **Mixed-registry note.** `@cytario/web` and `@cytario/plugin-api`
> publish to public npm. Plugins are free to publish wherever they
> like — public npm, GitHub Packages, or a private registry. Because a
> single scope-wide `@cytario:registry` directive cannot route both
> public-npm and GitHub-Packages packages under the same scope,
> consumers pin individual plugin packages with a per-package
> `<pkg>:registry=…` override as shown above.

## License

This project is licensed under [AGPL-3.0](LICENSE). The source code is publicly available to provide full transparency and ensure long-term access for our users, independent of Cytario as a company.

---

## Local Development

### Prerequisites

The application requires several backend services. A local cluster is provided via Podman:

```sh
cd devenv
podman kube play local-deployment.yaml
```

| Service    | Port       | Description                      |
| ---------- | ---------- | -------------------------------- |
| Keycloak   | 8080       | Identity provider (admin/admin)  |
| MinIO      | 9000, 9001 | S3-compatible object storage     |
| PostgreSQL | 5433       | Application database             |
| Valkey     | 6379       | Session cache (Redis-compatible) |

To stop: `podman kube down devenv/local-deployment.yaml`

### Getting Started

```sh
npm install
cp .env.template .env    # Pre-configured for the Podman cluster
npm run dev
```

### Keycloak Organizations

The app uses [Keycloak 26.6 Organizations](https://www.keycloak.org/docs/latest/server_admin/index.html#_managing_organizations) as the tenant boundary. Every session must carry an active organization — sessions without one are redirected to `/onboarding` and cannot reach any tenant-scoped route.

The local Podman cluster boots Keycloak with `KC_FEATURES=organizations` enabled and ships a `cytario` realm with the Organizations feature toggled on and a sample organization assigned to every seed user. To run against a custom Keycloak deployment:

1. Enable the Organizations realm feature (`KC_FEATURES=organizations` on the Keycloak server **and** the per-realm toggle in the admin UI).
2. Grant the `cytario-web-admin` service account `view-realm` + `manage-realm` on the `realm-management` client. No dedicated `view-organizations` role exists in KC 26.6 — the broader realm roles are required.
3. Assign every login-eligible user to at least one organization. Users without an organization land on `/onboarding`.

Group membership inside an organization (subgroups under `/admin/users`) drives in-tenant authorization. A `/admins` subgroup at a given scope confers admin rights over that scope; the `*` sentinel scope covers the entire organization.

### Session Cache (Redis/Valkey)

Sessions hold OAuth access/refresh/ID tokens and short-lived STS credentials. **TLS is required in production.** The app refuses to boot when `NODE_ENV !== "development"` unless one of the following is true:

| Env var                          | Value    | Meaning                                                                                              |
| -------------------------------- | -------- | ---------------------------------------------------------------------------------------------------- |
| `REDIS_TLS`                      | `"true"` | Wrap the ioredis connection in TLS (recommended).                                                    |
| `REDIS_CA_CERT`                  | PEM      | Optional CA bundle for self-signed deployments. Multi-line PEM string.                               |
| `REDIS_TLS_SERVER_NAME`          | hostname | Optional SNI / certificate hostname override.                                                        |
| `REDIS_INSECURE_ALLOW_PLAINTEXT` | `"true"` | Explicit opt-out for trusted private networks. Logs a warning. Not for use on shared infrastructure. |

The local Podman cluster runs Valkey without TLS, which is allowed because `NODE_ENV=development`. Managed Valkey deployments (helm chart, AWS ElastiCache, etc.) should set `REDIS_TLS=true`. Valkey reuses the standard `6379` port for TLS when `tls.enabled` is set — it does not move the listener to `6380` and refuses plaintext on the same port — so leave `REDIS_PORT` at `6379` unless your provider explicitly publishes a separate TLS endpoint.

In the production cluster (see `cytario-infrastructure`, C-212) the Valkey leaf cert is signed by a cluster-internal CA managed by cert-manager. The CA's public cert is distributed to every namespace as a `cytario-internal-ca` ConfigMap by trust-manager, and the `cytario-web` helm chart's `redis.caCertConfigMap.{name,key}` wires it into the pod as `REDIS_CA_CERT` via `valueFrom.configMapKeyRef`. The app sees the PEM through the normal env var path — no code-side knowledge of the trust source is required.

### Database

PostgreSQL with [Prisma ORM](https://www.prisma.io/). Connection configured via `DATABASE_URL` in `.env`.

```sh
npx prisma migrate dev --name <migration-name>   # Create + apply migration
npx prisma migrate deploy                         # Apply pending migrations
npx prisma studio                                 # Database GUI
npx prisma generate                               # Regenerate client
```

#### Cloning the DEV database

`scripts/clone-dev-db.mjs` copies the DEV PostgreSQL (schema + data) into the local Podman cluster's Postgres. It uses the `pg` driver rather than `pg_dump`/`psql`, so it works through pgbouncer (transaction-pooling mode) — `pg_dump` fails on session-level operations there.

```sh
# 1. Make sure the local cluster is up and Postgres is reachable on :5433.
cd devenv && podman kube play local-deployment.yaml && cd ..

# 2. Clone. Pass the DEV DATABASE_URL as the source and the local URL
#    (from .env.template) as the target. The script refuses to write to
#    any host that doesn't resolve to loopback.
npm run clone-dev-db -- \
  "$DEV_DATABASE_URL" \
  "postgresql://cytario:cytario@localhost:5433/cytario"

# 3. Apply any migrations the local checkout has that DEV doesn't yet.
DATABASE_URL="postgresql://cytario:cytario@localhost:5433/cytario" \
  npx prisma migrate deploy
```

The clone copies every public-schema table, including `_prisma_migrations`, so Prisma recognises which migrations are already applied. If the target database already has tables, the script lists them and asks for confirmation before dropping them.

### Testing

```sh
npm test              # Unit & component tests (vitest, watch mode)
npm run coverage      # Unit tests with coverage report
```

E2E tests (Playwright) live in a sibling repository and are triggered automatically on every PR via cross-repo dispatch.

### Design System

To develop [`@cytario/design`](https://github.com/cytario/cytario-design) components locally and see changes reflected in cytario-web, run a single command. Assumes both repos are cloned as siblings (`../cytario-design`):

```sh
npm run dev:design
```

This links `@cytario/design` via `npm link`, starts `tsup --watch` in the design repo, and runs the cytario-web dev server — all in one process. Changes to design system source are rebuilt by tsup and picked up by Vite's HMR automatically.

The `vite.config.ts` is configured to handle the symlink: `optimizeDeps.exclude` skips pre-bundling, `ssr.noExternal` processes it through Vite's pipeline, and `server.watch` picks up changes in node_modules.

> **Note:** Switching back to `npm run dev` automatically unlinks `@cytario/design` and restores the published version (via the `predev` script). No manual `npm install` needed.

### Debugging

The app uses [Zustand](https://github.com/pmndrs/zustand) for state management with the `devtools` middleware. Install the [Redux DevTools](https://chromewebstore.google.com/detail/redux-devtools/lmhkpmbekcpmknklioeibfkpmmfibljd) browser extension to inspect store state and actions.

### Commits

[Conventional Commits](https://www.conventionalcommits.org/) enforced via [commitlint](https://commitlint.js.org/) (`feat`, `fix`, `docs`, `refactor`, `test`, `build`, `ci`, `chore`, etc.).

### Deployment

```sh
npm run build    # Outputs build/server and build/client
npm start        # Production server
```

For containerized deployments, see the `Dockerfile`. The image is built on distroless (`gcr.io/distroless/nodejs24-debian12`); database migrations run automatically on startup via `docker-entrypoint.mjs`.

## Acknowledgements

Built on [Viv](https://github.com/hms-dbmi/viv), a library for multiscale visualization of high-resolution, highly multiplexed bioimaging data on the web, developed by the [HIDIVE Lab](https://hidivelab.org/) at Harvard Medical School.
