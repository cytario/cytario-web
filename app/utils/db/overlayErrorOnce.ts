/**
 * One-shot suppression for overlay error notifications. Tile loads fail per
 * tile; without this gate each failure would toast. Reporting stays suppressed
 * for a resource until its config changes (new key) or the overlay is
 * removed/reconfigured (explicit reset).
 */
const reported = new Set<string>();

const keyFor = (resourceId: string, configHash: string): string => `${resourceId}|${configHash}`;

/** True the first time a resource+config pair reports; false afterwards. */
export function shouldReportOverlayError(resourceId: string, configHash: string): boolean {
  const key = keyFor(resourceId, configHash);
  if (reported.has(key)) return false;
  reported.add(key);
  return true;
}

/** Re-arm reporting for a resource (config change, removal, or manual retry). */
export function resetOverlayErrorReporting(resourceId: string): void {
  const prefix = `${resourceId}|`;
  for (const key of reported) {
    if (key.startsWith(prefix)) reported.delete(key);
  }
}
