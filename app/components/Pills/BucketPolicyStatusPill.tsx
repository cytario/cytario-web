import { Badge, type BadgeColor } from "@cytario/design";

import type { BucketPolicyStatus } from "~/.generated/client";

interface StatusConfig {
  label: string;
  color: BadgeColor;
}

const statuses: Record<BucketPolicyStatus, StatusConfig> = {
  none: { label: "No policy", color: "slate" },
  applied: { label: "Applied", color: "green" },
  drifted: { label: "Drifted", color: "amber" },
  error: { label: "Error", color: "rose" },
  externally_managed: { label: "Managed externally", color: "purple" },
};

/** Signals whether a connection's intended bucket-policy grant is applied, drifted, or errored. */
export function BucketPolicyStatusPill({ status }: { status: BucketPolicyStatus }) {
  const config = statuses[status] ?? statuses.none;
  return <Badge color={config.color}>{config.label}</Badge>;
}
