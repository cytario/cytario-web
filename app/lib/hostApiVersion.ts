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
export const HOST_API_VERSION = "6.11.0";
