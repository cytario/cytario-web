export { probeIndex } from "./probeIndex";
// queryIndex functions (searchIndex, listPrefix, getIndexCount) are imported
// directly from ./queryIndex when needed, not through this barrel.
// This avoids pulling server-only connectionConfig.server dependencies
// into client bundles via the barrel re-export.
