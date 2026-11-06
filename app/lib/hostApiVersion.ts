/**
 * The plugin contract version. 9.0.0 is the org-aware surface: server
 * endpoints declare an org scope and are served under `/api/v1/{org}/...`,
 * plugin-relative paths, and `ctx.client.orgPaths` URL builders. Breaking —
 * plugins must declare `^9.0.0`.
 */
export const HOST_API_VERSION = "9.0.0";
