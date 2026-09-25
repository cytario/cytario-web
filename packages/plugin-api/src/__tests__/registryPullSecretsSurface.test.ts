import type { ComputeRoleSession } from "../host";
import { HOST_API_VERSION } from "~/lib/hostApiVersion";

test("ComputeRoleSession accepts the per-catalog registryPullSecrets map", async () => {
  const mod = await import("../index");
  // Type-only surface: no runtime export was added alongside the type.
  expect((mod as Record<string, unknown>).ComputeRoleSession).toBeUndefined();

  const session: ComputeRoleSession = {
    signedFetch: () => Promise.resolve(new Response(null, { status: 200 })),
    jobQueueArn: "arn:aws:batch:eu-central-1:825967678234:job-queue/gpu-queue",
    jobRoleArn: "arn:aws:iam::825967678234:role/cytario/cp/job",
    executionRoleArn: "arn:aws:iam::825967678234:role/cytario/cp/exec",
    imagePullSecretRef:
      "arn:aws:secretsmanager:eu-central-1:825967678234:secret:cytario-compute/cp-1/registry-pull",
    registryPullSecrets: {
      "ac-1":
        "arn:aws:secretsmanager:eu-central-1:825967678234:secret:cytario-compute/cp-1/registry-pull/ac-1",
      "ac-2":
        "arn:aws:secretsmanager:eu-central-1:825967678234:secret:cytario-compute/cp-1/registry-pull/ac-2",
    },
    logGroupName: "/aws/batch/cytario-compute/test",
  };
  expect(session.registryPullSecrets?.["ac-1"]).toContain("registry-pull/ac-1");
  expect(Object.keys(session.registryPullSecrets ?? {})).toHaveLength(2);
});

test("a session predating the field still satisfies the type (scalar fallback alone)", () => {
  const legacy: ComputeRoleSession = {
    signedFetch: () => Promise.resolve(new Response(null, { status: 200 })),
    jobQueueArn: "arn:aws:batch:eu-central-1:825967678234:job-queue/gpu-queue",
    jobRoleArn: "arn:aws:iam::825967678234:role/cytario/cp/job",
    executionRoleArn: "arn:aws:iam::825967678234:role/cytario/cp/exec",
    imagePullSecretRef: null,
    logGroupName: "/aws/batch/cytario-compute/test",
  };
  // imagePullSecretRef stays required as-is; the map is absent, not null.
  expect(legacy.imagePullSecretRef).toBeNull();
  expect(legacy.registryPullSecrets).toBeUndefined();
});

// The map landed in 6.11.0; the floor has since moved on. The version-literal
// guard moved here from the registryKind surface test.
//
// A guard, not a record: whenever the host adds an additive minor, this
// assertion moves with it, so a bump nobody meant to make shows up here.
// 6.13.0 carries the pending-ledger JobLedger surface: `record` returns the
// row id, the patch-shaped `update`, the `remove` re-key to the row id, and
// the `JobStatus` vocabulary move.
test("host apiVersion is 6.13.0 (carries the pending-ledger JobLedger surface)", () => {
  expect(HOST_API_VERSION).toBe("6.13.0");
});
