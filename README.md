# Cytario Web

[![CI](https://github.com/cytario/cytario-web/actions/workflows/ci.yml/badge.svg)](https://github.com/cytario/cytario-web/actions/workflows/ci.yml)
![Test Coverage Badge](badge.svg)
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](LICENSE)
[![GitHub release](https://img.shields.io/github/v/release/cytario/cytario-web)](https://github.com/cytario/cytario-web/releases)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-green.svg)](https://nodejs.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![GitHub Stars](https://img.shields.io/github/stars/cytario/cytario-web?style=social)](https://github.com/cytario/cytario-web)

Cytario Web is a modern file browser and viewer application for scientific imaging data. It provides a web-based interface to explore, visualize, and manage large-scale imaging datasets stored in S3-compatible object storage. The application supports various scientific file formats and offers interactive viewing capabilities for researchers and data scientists.

![Screenshot](screenshot.png)

## Prerequisites

### Local Development Cluster (Podman)

The application requires several backend services. A local development cluster is provided via Podman:

```sh
cd devenv
podman kube play local-deployment.yaml
```

This starts:

| Service | Port | Description |
|---------|------|-------------|
| Keycloak | 8080 | Identity provider (admin/admin) |
| MinIO | 9000, 9001 | S3-compatible object storage |
| PostgreSQL | 5433 | Application database |
| Valkey | 6379 | Session cache (Redis-compatible) |

To stop the cluster:

```sh
podman kube down devenv/local-deployment.yaml
```

To reset all data:

```sh
cd devenv
rm -rf postgres-data keycloak-data minio-data cytario-db-data valkey-data
```

### Database (PostgreSQL)

The application uses PostgreSQL with Prisma ORM for storing user bucket configurations.

Configure the database connection in `.env`:

```sh
DATABASE_URL="postgresql://cytario:cytario@localhost:5433/cytario"
```

#### Migrations

**Development workflow:**

1. Edit `prisma/schema.prisma` to modify the database schema
2. Create and apply a migration:
   ```sh
   npx prisma migrate dev --name <migration-name>
   ```
3. Commit the generated migration file in `prisma/migrations/`

**After pulling changes** (if someone else added a migration):

```sh
npx prisma migrate deploy
```

**Production:** Migrations are applied automatically on container startup via `docker-entrypoint.sh`.

**Useful commands:**

- `npx prisma studio` - Open database GUI
- `npx prisma generate` - Regenerate Prisma Client after schema changes

## Install

Install the npm dependencies:

```sh
npm install
```

## Environment Configuration

Copy the template and adjust as needed:

```sh
cp .env.template .env
```

The template is configured for local development with the Podman cluster.

## Development

Run the local dev server:

```sh
npm run dev
```

Install [Redux DevTools](https://chromewebstore.google.com/detail/redux-devtools/lmhkpmbekcpmknklioeibfkpmmfibljd) to analyze the various [zustand](https://github.com/pmndrs/zustand) stores.

### Commits

We use [Conventional Commits](https://www.conventionalcommits.org/) to maintain consistent commit messages.

**Allowed types:**

- `feat`: A new feature
- `fix`: A bug fix
- `docs`: Documentation only changes
- `style`: Formatting, white-space, etc (no code change)
- `refactor`: Code changes that neither fix a bug nor add a feature
- `perf`: Performance improvements
- `test`: Adding or fixing tests
- `build`: Build system or dependencies changes
- `ci`: Continuous Integration config changes
- `chore`: Other changes that don’t modify src or test files
- `revert`: Reverts a previous commit

## Deployment

First, build your app for production:

```sh
npm run build
```

Then run the app in production mode:

```sh
npm start
```

Now you'll need to pick a host to deploy it to.

### DIY

If you're familiar with deploying Node applications, the built-in app server is production-ready.

Make sure to deploy the output of `npm run build`

- `build/server`
- `build/client`

## Styling

This template comes with [Tailwind CSS](https://tailwindcss.com/) already configured for a simple default starting experience. You can use whatever css framework you prefer. See the [Vite docs on css](https://vitejs.dev/guide/features.html#css) for more information.

## Acknowledgements

cytario-web is built on [Viv](https://github.com/hms-dbmi/viv), a library for multiscale visualization of high-resolution, highly multiplexed bioimaging data on the web. Viv was developed by the [HIDIVE Lab](https://hidivelab.org/) at Harvard Medical School.
