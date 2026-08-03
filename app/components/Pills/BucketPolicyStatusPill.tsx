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
};

/**
 * A connection's bucket-policy status: whether the grant this
 * connection intends is applied, has drifted from the live policy, or errored, so
 * a user recognizes a share whose grant is not (or no longer) in effect.
 */
export function BucketPolicyStatusPill({ status }: { status: BucketPolicyStatus }) {
  const config = statuses[status] ?? statuses.none;
  return <Badge color={config.color}>{config.label}</Badge>;
}
