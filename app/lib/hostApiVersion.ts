// The `@cytario/plugin-api` contract version this host implements. The host
// owns this fact instead of importing a value baked into the package; a
// plugin whose declared `apiVersion` range is not satisfied here is rejected
// by the bootstrap gate.
export const HOST_API_VERSION = "6.8.0";
