# CLAUDE.md — Cytario Web

## Principal

You are a **principal full-stack developer** with deep expertise in TypeScript, React, React Router, Tailwind CSS, deck.gl, WebAssembly, OAuth 2.0/OIDC, PostgreSQL, Prisma, and cloud-native architectures. You write production-grade, secure, accessible, and performant code. You follow SOLID principles, favor composition over inheritance, and ensure every change has corresponding test coverage.

---

## Project Overview

**Cytario Web** is a scientific imaging data browser and viewer. It provides a web-based interface for exploring, visualizing, and managing large-scale imaging datasets (OME-TIFF, Parquet, GeoTIFF) stored in S3-compatible object storage. Built for researchers and data scientists working with multiplexed microscopy and spatial biology data.

**License:** AGPL-3.0 | **Node.js:** >=24.10.0

---

## Tech Stack

| Layer         | Technology                                                          |
|---------------|---------------------------------------------------------------------|
| Framework     | React Router v7 (SSR), React 19, Vite 6                             |
| Language      | TypeScript 5.8 (strict mode)                                        |
| Styling       | Tailwind CSS 3.4 (class-based dark mode)                            |
| State         | Zustand 5 (with immer, persist, devtools middleware)                |
| Forms         | react-hook-form 7 + zod 4 validation                                |
| Tables        | @tanstack/react-table 8, @tanstack/react-virtual 3                  |
| Visualization | deck.gl 9.1, @hms-dbmi/viv 0.18, Apache Arrow 21                    |
| WebAssembly   | @duckdb/duckdb-wasm (in-browser SQL), lzw-tiff-decoder (Web Worker) |
| Auth          | OAuth 2.0 Authorization Code Flow via Keycloak                      |
| Database      | PostgreSQL (Prisma 7 ORM), Redis/Valkey (sessions via ioredis)      |
| Cloud         | AWS SDK v3 (S3, STS AssumeRoleWithWebIdentity, presigned URLs)      |
| UI Components | @headlessui/react 2, lucide-react, motion 12                        |
| Testing       | Vitest 3.2, @testing-library/react 16, happy-dom                    |
| Linting       | ESLint 8 (flat config), @typescript-eslint, jsx-a11y, import        |
| Formatting    | Prettier (default config)                                           |
| Git Hooks     | Husky 9 (pre-commit: lint + typecheck, commit-msg: commitlint)      |
| CI/CD         | GitHub Actions, semantic-release, GHCR container registry           |

---

## Project Structure

```
cytario-web/
├── app/
│   ├── .generated/          # Prisma generated client (DO NOT EDIT)
│   ├── .server/             # Server-only code
│   │   ├── auth/            # OAuth middleware, session, token refresh
│   │   └── db/              # PostgreSQL + Redis connections
│   ├── components/          # Shared React components
│   │   └── .client/         # Client-only components (ImageViewer, deck.gl)
│   ├── forms/               # Form definitions with zod schemas
│   ├── hooks/               # Custom React hooks
│   ├── routes/              # Route modules (loaders, actions, components)
│   │   ├── auth/            # Login, logout, callback
│   │   ├── buckets/         # Bucket list + connect modal
│   │   ├── layouts/         # Layout routes (scrollview)
│   │   └── api/             # API-only routes
│   ├── utils/               # Utility functions
│   ├── config.ts            # Typed environment config
│   ├── context.ts           # React contexts
│   ├── entry.client.tsx     # Client entry point
│   ├── entry.server.tsx     # Server entry point
│   ├── root.tsx             # Root layout + ErrorBoundary
│   ├── routes.ts            # Route configuration
│   └── tailwind.css         # Tailwind imports
├── prisma/                  # Schema + migrations
├── public/                  # Static assets (fonts, logos)
├── devenv/                  # Local dev environment (Podman)
├── .github/                 # Workflows + PR/issue templates
└── .husky/                  # Git hooks
```

---

## Commands

```bash
npm run dev          # Start dev server
npm run build        # Production build (react-router build)
npm start            # Start production server (react-router-serve)
npm run lint         # ESLint with cache
npm run typecheck    # react-router typegen && tsc
npm run test         # Vitest (watch mode)
npm run coverage     # Vitest with v8 coverage
npx prisma generate  # Regenerate Prisma client after schema changes
npx prisma migrate dev  # Create + apply DB migration
npx prisma studio    # Database GUI
```

---

## Code Conventions

### Exports
- **Named exports only** in `app/` — no default exports (enforced by ESLint)
- Exceptions: route modules (`app/routes/**`), `app/root.tsx`, `app/entry.*.tsx`

### Imports
- External packages first, then internal (`~/`) — alphabetically sorted within groups
- Separated by a blank line between groups
- Path alias: `~/*` maps to `./app/*`

```typescript
import { redirect } from "react-router";
import { useState } from "react";

import { Button } from "~/components/Controls";
import { cytarioConfig } from "~/config";
```

### TypeScript
- **Strict mode** — no `any` without justification
- Use `zod` schemas for runtime validation at system boundaries
- Prisma generates types — never manually duplicate DB types
- Prefer `interface` for object shapes, `type` for unions/intersections

### React Patterns
- Server/client separation via `.server/` and `.client/` directories
- Route modules export: `loader`, `action`, `meta`, `handle`, `middleware`, default component
- Middleware chain: `sessionMiddleware` → `authMiddleware`
- Use `React.lazy()` + `<Suspense>` for heavy client-only components (ImageViewer)
- Use `@headlessui/react` for accessible interactive components (dialogs, menus, tabs)

### State Management
- **Zustand** stores — one store per domain concern
- Use `immer` middleware for complex state updates
- Use `persist` middleware selectively (localStorage or sessionStorage)
- Singleton pattern via factory functions: `createViewerStore(id)`, `createTableStore(id)`
- Define selectors separately from stores

### Styling
- Utility-first Tailwind CSS — no CSS modules, no styled-components
- Use `tailwind-merge` (`twMerge`) for conditional class composition
- Custom design tokens: `cytario-purple-500`, `cytario-turquoise-*`
- Custom font: Montserrat
- Use `motion` library for animations

### Testing
- **Every change must have test coverage** — unit and/or integration tests
- Use `test()` — never `it()` (enforced by ESLint)
- Co-locate tests in `__tests__/` directories adjacent to source files
- Test environment: `happy-dom` with `@testing-library/react`
- Vitest globals: `describe`, `test`, `expect`, `beforeEach`, `afterEach`, `vi`
- Mock with `vi.mock()` — prefer dependency injection where possible
- Coverage includes only `app/` excluding generated code, types, config, and workers

### Error Handling
- Root `ErrorBoundary` in `root.tsx`
- Server errors return appropriate HTTP status codes
- Client errors surface via notification store (toast pattern)
- Never swallow errors silently

---

## Architecture Principles

### SOLID
- **S** — Single Responsibility: one concern per module (e.g., separate stores, middleware, route loaders)
- **O** — Open/Closed: extend via composition (zustand middleware, deck.gl layers), not modification
- **L** — Liskov Substitution: consistent interfaces across S3 providers (AWS, MinIO)
- **I** — Interface Segregation: small, focused hook and utility APIs
- **D** — Dependency Inversion: server code depends on abstractions (Prisma, session interface), not concrete implementations

### Security
- OAuth 2.0 Authorization Code Flow (not deprecated ROPC)
- JWT validation with expiry checks and 5-minute buffer
- Automatic token refresh via middleware
- STS `AssumeRoleWithWebIdentity` for temporary S3 credentials
- httpOnly, secure, sameSite cookies for sessions
- Never expose secrets to the client

### Performance
- SSR with React Router v7 for fast initial loads
- WebAssembly (DuckDB) for in-browser SQL on Parquet/CSV
- Web Workers for CPU-intensive decompression (LZW TIFF decoder)
- Virtual scrolling (`@tanstack/react-virtual`) for large lists
- Tile-based rendering (deck.gl `TileLayer`) for large images
- Apache Arrow for zero-copy columnar data access
- IndexedDB caching (`idb-keyval`) for file persistence
- LRU cache for server-side hot data

---

## Git & CI/CD

### Commit Messages
- **Conventional Commits** enforced by commitlint: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`, etc.
- Commits are validated via Husky `commit-msg` hook

### Pre-commit Checks
- `npm run lint` — ESLint (must pass)
- `npm run typecheck` — TypeScript (must pass)

### CI Pipeline (GitHub Actions)
1. QA Checks: lint → typecheck → test with coverage
2. Semantic Release: auto-version from commit history
3. Container Build: multi-stage Docker → GHCR

### Branching
- `main` is the default and release branch
- PRs target `main`, require passing CI

---

## Local Development

**Services (Podman/Docker Compose):**
- Keycloak — `localhost:8080` (admin/admin)
- MinIO — `localhost:9000` (console: 9001)
- PostgreSQL — `localhost:5433`
- Valkey/Redis — `localhost:6379`

**Setup:**
```bash
cp .env.template .env       # Configure environment variables
npm install                  # Install dependencies
npx prisma generate          # Generate Prisma client
npx prisma migrate dev       # Apply migrations
npm run dev                  # Start dev server at localhost:3000
```

---

## Key Domain Concepts

- **Bucket** — S3-compatible storage container (AWS S3 or MinIO)
- **OME-TIFF** — Open Microscopy Environment TIFF format for multiscale bioimaging
- **Channel** — A single imaging modality/fluorophore in a multiplexed image
- **Overlay** — Cell segmentation or marker data rendered atop images (Parquet → Arrow → deck.gl)
- **Presigned URL** — Temporary authenticated URL for direct S3 object access
- **DuckDB** — In-browser WASM SQL engine for querying Parquet/CSV files without a server
