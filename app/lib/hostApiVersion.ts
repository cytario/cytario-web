// The `@cytario/plugin-api` contract version this host implements. The host
// owns this fact instead of importing a value baked into the package; a
// plugin whose declared `apiVersion` range is not satisfied here is rejected
// by the bootstrap gate.
//
// 6.9.0: `CatalogConnectionProjection` gains the optional `registryKind` and
// `credentialMode` fields — additive at a minor version, so existing plugins
// still satisfy the contract.
//
// 6.10.0: `StoragePickerOptions` gains the optional `select` mode, so the picker
// can hand back a destination folder as well as input files — additive at a
// minor version, so a plugin passing no new option keeps today's file-selection
// behaviour.
//
// 6.11.0: `ComputeRoleSession` gains the optional `registryPullSecrets` map, so
// a plugin can pick the pull credential of the application's owning catalog —
// additive at a minor version, so existing plugins still satisfy the contract.
//
// 6.12.0: `HostCapabilities.mintJobBrokerToken` is added and `TokenGrant`
// narrows to the grant's identifiers, so a plugin mints its own per-job broker
// token rather than receiving the batch's grant token. Additive at a minor
// version for the host gate, but a plugin that consumed `TokenGrant.token` must
// move to the new capability — and this one is not backward compatible for such
// a consumer within 6.x, despite the minor.
//
// 6.13.0: `JobLedger.record` returns the ledger row's `id` and gains the
// patch-shaped `update`; `remove` re-keys to the row `id`; `JobRecord` gains
// `id`/`status` with `jobId` now runtime-optional, and the `JobStatus`
// vocabulary moves here from the compute plugin — additive at a minor version
// for the host gate, but a plugin that consumed the old `remove(jobId)`
// signature must move to the row-id key.

export const HOST_API_VERSION = "6.13.0";
