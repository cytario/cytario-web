/**
 * The `@cytario/plugin-api` contract version this host implements. Tracks the
 * plugin-api package major the host targets (plugins declare `apiVersion`
 * against the same namespace). The host owns this fact — it provides the slots,
 * the plugin context, and `hostConfig` — instead of importing a value baked into
 * the package. Bump it when upgrading the targeted plugin-api major or adopting
 * a new contract feature; a plugin whose declared `apiVersion` range is not
 * satisfied here is rejected by the bootstrap gate.
 */
export const HOST_API_VERSION = "4.0.0";
