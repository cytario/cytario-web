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
// 6.14.0: `PluginContext` gains the client-live `imageMetadata` registry, which
// resolves a storage object's format-agnostic image characteristics through the
// format handler's own `load()` — additive at a minor version, so existing
// plugins still satisfy the contract.
//
// 8.0.0: `PluginContext.storagePicker` and `.imageMetadata` are replaced by a
// single `ctx.client` capability object (`ClientCapabilities`), the client-side
// counterpart of `ctx.host`. Neither was ever a plugin contribution — the host
// supplies them — so the registry wrapper (a `get()`, a `scopedFor()` that
// ignored the plugin name, and a `{ get: () => null }` sink) carried no meaning;
// `ctx.client.storagePicker` / `ctx.client.imageMetadata` are now plain members
// that are null in the server realm. Breaking only for a plugin that read those
// two members — in practice compute-plugin, the sole consumer — so every other
// plugin keeps its existing floors and adds `|| ^8.0.0`.
//
// `satisfies()` now understands `||` alternation, so a plugin can declare the
// span of majors it actually supports rather than being pinned to the newest.

export const HOST_API_VERSION = "8.0.0";
