import { Badge, type BadgeColor } from "@cytario/design";

import type { BucketPolicyStatus } from "~/.generated/client";

interface StatusConfig {
  label: string;
  color: BadgeColor;
}

const statuses: Record<BucketPolicyStatus, StatusConfig> = {
  none: { label: "No policy", color: "neutral" },
  applied: { label: "Applied", color: "success" },
  drifted: { label: "Drifted", color: "warning" },
  error: { label: "Error", color: "destructive" },
  externally_managed: { label: "Managed externally", color: "primary" },
};

/** Signals whether a connection's intended bucket-policy grant is applied, drifted, or errored. */
export function BucketPolicyStatusPill({ status }: { status: BucketPolicyStatus }) {
  const config = statuses[status] ?? statuses.none;
  return <Badge color={config.color}>{config.label}</Badge>;
}
