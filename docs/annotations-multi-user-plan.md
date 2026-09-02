# Multi-User Annotations: Conditional Writes + Realtime Propagation

Status: plan, ready for implementation · Decisions locked by product owner (see [Decisions](#decisions))
Scope: annotation sidecar persistence in `cytario-web`

## Current Mechanism (as of writing)

- **Shape**: GeoJSON `FeatureCollection` per image per **annotation set**, stored as sidecar
  `<image>.annotations.<setId>.json` next to the image (`app/utils/sidecarKey.ts`), where
  `setId` is a UUID. The sidecar JSON body carries `cytario.author` (the user who created
  the set), so ownership is not tied to the filename. Multiple sets per user are supported;
  the UI labels them "Annotation Set N" sorted own-first.
- **Store**: `annotationSets: AnnotationSet[]` where `AnnotationSet = { id: string,
createdBy: string, features: AnnotationFeature[] }`, with `activeSetId` selecting the own
  set that receives drawings (`viewer.annotations.store.ts`). `ensureOwnSet()` lazy-creates
  one on first draw if no own set exists.
- **Read**: DuckDB-WASM `glob()` + `read_text()` over the `*` wildcard — all sets'
  sidecars in one go, `cytario.author` extracted per file as `createdBy`
  (`app/utils/db/getAnnotationsWasm.ts`, `app/utils/db/sidecarRepository.ts`)
- **Write**: full-file overwrite via `COPY (SELECT json('...') AS ...) TO 's3://...' (FORMAT JSON)`
  with hand-escaped SQL string interpolation (`sidecarRepository.ts` `write`),
  keyed by `setId` and including `cytario.author` in the body
  (`app/utils/db/writeAnnotationsWasm.ts`)
- **Sync**: one-time read seeds the store (`seedAnnotations`), then an 800 ms debounced
  per-set diff (reference equality on `set.features`) → full-file rewrite, serialized
  locally (`app/components/.client/ImageViewer/state/store/annotationSync.ts`)
- **Auth**: STS web-identity credentials `SET` onto the shared DuckDB singleton connection
  (`app/utils/db/createDatabase.ts`); IAM grants `PutObject` on `*.annotations.*.json`
  (`app/.server/auth/sessionPolicy.ts` `getPutOwnSidecarStatement`)
- **Realtime infra**: none. No WebSocket, SSE, polling, or CRDT — peers' annotations are
  visible only from the load-time read and never refresh.

## Challenge / Verdict

**Keep DuckDB for what it's uniquely good at** (Parquet/CSV overlays, tile queries, marker
analytics). **Drop it as the sidecar JSON transport**:

- `signedFetch` (`app/utils/signedFetch.ts` `createSignedFetch`) already ships in the bundle,
  supports PUT with bodies and arbitrary caller headers (so `If-Match` flows through the
  signature), and resolves STS rotation per-request.
- It eliminates the `escapeSqlString`/`COPY` interpolation hazard and the shared-connection
  `SET s3_*` race that `createDatabase.ts` currently has to serialize around.
- The design's "single-writer per key" invariant (`sidecarRepository.ts` header comment) is
  the load-bearing fiction that breaks the moment edit-others lands. The IAM wildcard
  already permits writing any set's sidecar (filename convention only); two clients
  holding working copies of the same set-key today means **silent last-writer-wins
  clobber** — no ETag, no `If-Match`, no versioning, no detection.

## Decisions (locked)

| Question          | Decision                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------ |
| Storage location  | **Stay in S3** — annotations co-located with customer data                                 |
| Concurrency model | **ETag optimistic locking** — `If-Match` on PUT, merge/retry conflict UX, no offline merge |
| Realtime channel  | **SSE + Redis pub/sub** — peer changes surface within seconds; no cursors/presence for now |
| Concurrency scale | **2–5 concurrent editors per slide** (pair-review sessions)                                |

## Architecture

```
Editor A ──PUT If-Match──▶ S3 sidecar ──412?──▶ GET+merge+retry
   │
   └─POST notify─▶ /api/annotations/events ─▶ Redis pub/sub (channel: org:image-uri)
                                              │
Editor B ◀─SSE─ /api/annotations/stream ◀──────┘ ─▶ single-user refetch ─▶ store merge
```

**S3 remains the durable store**; the server only carries notifications, never feature data —
events are trust-minimal ("key X by user Y changed, etag Z"), so a malicious publisher can
at worst cause a harmless authoritative refetch.

## Work Packages

### 1. HTTP sidecar repository (replaces duckdb transport)

- New `app/utils/db/sidecarHttpRepository.ts` alongside the existing `SidecarRepository` interface:
  - `readAll` — reuse `app/utils/listObjects/listObjectsClient.ts` for the wildcard LIST,
    then N parallel signed GETs; capture **ETag per file**
- `readOne(setId)` — GET + ETag (used by remote-change refetches)
- `write(kind, document, expectedEtag)` — signed PUT with `If-Match: <etag>`, or
  `If-None-Match: *` for lazy-create (matches the existing "never write an empty file for
  a first-time user" rule in `annotationSync.ts` flush)
- Document shape/envelope (`app/utils/db/writeAnnotationsWasm.ts`) unchanged — old sidecars
  stay valid (including legacy `<userId>`-keyed files, which `getAnnotationsWasm.ts` reads
  via fallback), zero migration.
- PUT response returns the new ETag → advances the baseline without a re-GET.

### 2. Optimistic concurrency + merge in `annotationSync.ts`

- Baseline becomes `Record<setId, { features, createdBy, etag }>`; flush PUTs conditionally.
- **412 path**: refetch (GET + new ETag), three-way per-feature merge with the old baseline
  as common ancestor — features we changed (id-diff persisted→current) win; untouched ids
  take theirs; additions union; deletions applied by id. Retry once with the new ETag;
  second 412 → toast "concurrent edit — kept local copy" and leave the key stale for retry.
  The merge is a pure function → unit-testable (`__tests__/` adjacent to source, per AGENTS.md).
- **Remote-apply guard**: `applyRemoteSetFeatures(setId, features)` only overwrites a
  set's local array when it still equals the persisted baseline (no pending local edits);
  otherwise stash in a pending-remote map applied after the next successful flush.
  Prevents a peer event from clobbering an in-flight local edit.

### 3. Redis pub/sub + SSE

- **Publish**: `POST /api/annotations/events` — new API route (register in `app/routes.ts`
  apiRoutes), session+auth middleware chain as existing routes; validates
  `{ s3Uri, userId, etag }` (zod), verifies tenant via session `organization`, then
  `redis.publish("annotations:<org>:<image-uri>", payload)`.
- **Subscribe**: `GET /api/annotations/stream?s3Uri=...` — SSE loader returning a
  `ReadableStream` with `text/event-stream`. Needs a **dedicated ioredis subscriber
  connection** (`app/.server/db/` — subscribe mode requires its own client; the existing
  `redis` singleton stays command-only). EventSource (same-origin, cookie session)
  auto-reconnects; on reconnect do a full conditional `readAll` catch-up.
- Events never carry features — only `{ setId, createdBy, etag }` — receivers always GET S3 directly
  as the authority.

### 4. Cleanup + hardening

- Migrate `app/components/TextEditor/readText.ts` (duckdb text sidecar read) to the same
  HTTP repo; then delete the duckdb `SidecarRepository`.
- `sessionPolicy.ts` comment ("per-user scoping is filename convention, not IAM") — now
  _intentional_ since edit-others is the direction; update comment to say so.
- Presence-lite: events include createdBy → "annotating now" badges in the sidebar panel
  (cheap, fits SSE; cursors would need the WebSocket upgrade explicitly deferred).

## Sequencing (atomic commits)

1. `feat: signed-fetch HTTP transport for sidecar reads` (repository + readAll/readOne + tests; annotationSync read swap)
2. `feat: ETag optimistic concurrency for annotation sidecar writes` (conditional PUT + merge + tests)
3. `feat: annotation change notifications via Redis pub/sub` (publish endpoint)
4. `feat: SSE stream for live peer annotation updates` (subscriber connection + stream route + client EventSource + store apply guard)
5. `refactor: migrate TextEditor reads off duckdb, drop sidecar SQL transport`

## Risks / Open Items to Verify Early

- **Conditional PUT support per provider**: AWS supports `If-Match` on PutObject (since
  08/2024); MinIO does too — but the provider catalog includes arbitrary S3-compatible
  endpoints that may return 501. Needs a provider capability flag + non-conditional
  fallback (last-writer-wins, current behavior).
- **Bucket CORS**: PUT + `if-match`/`if-none-match` headers must be in the CORS config the
  bucket policy automation emits — duckdb httpfs PUTs today, so methods are likely fine,
  but the extra headers need checking.
- **Proxy buffering for SSE**: the container ingress must not buffer `text/event-stream` —
  worth a 30-minute spike before committing to the stream route; worst case fall back to
  ETag-conditional polling of `readAll` (the `If-None-Match` 304 path makes it cheap).
- **STS write scope**: `read-only` connections get no sidecar PUT — read-only users can't
  write, so no events from them; their _viewers_ still receive. No change needed.

## Deliberate Omission

File-per-set granularity is kept. An alternative is one file per (set × active-class) or
per-feature objects to shrink clobber windows further — at 2–5 concurrent editors with
mostly-disjoint regions, the extra S3 op volume is not worth it. Revisit if annotation
sprints (10+ editors) become a real use case.
