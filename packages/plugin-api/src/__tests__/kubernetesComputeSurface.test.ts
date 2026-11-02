import type { ComputeConnectionProjection, ComputeRoleSession } from "../host";

test("ComputeConnectionProjection carries the Kubernetes endpoint", async () => {
  const mod = await import("../index");
  // Type-only surface: no runtime export was added alongside the type.
  expect((mod as Record<string, unknown>).ComputeConnectionProjection).toBeUndefined();

  const projection: ComputeConnectionProjection = {
    id: "cp-k8s-1",
    name: "Lab Cluster",
    type: "KUBERNETES_JOBS",
    region: "on-prem",
    endpoint: "https://kube.lab.example.com:6443",
  };
  expect(projection.endpoint).toBe("https://kube.lab.example.com:6443");

  const aws: ComputeConnectionProjection = {
    id: "cp-1",
    name: "GPU Cluster",
    type: "AWS_BATCH",
    region: "eu-central-1",
  };
  expect(aws.endpoint).toBeUndefined();
});

test("ComputeRoleSession accepts a Kubernetes session without the AWS fields", () => {
  const session: ComputeRoleSession = {
    signedFetch: () => Promise.resolve(new Response(null, { status: 200 })),
    imagePullSecretRef: null,
    providerConfig: {
      endpoint: "https://kube.lab.example.com:6443",
      namespace: "cytario-jobs",
      imagePullSecrets: { "ac-1": "cytario-registry-pull" },
      serviceAccountName: "cytario-job",
      logMode: "pod-logs",
      placement: { nodeSelector: { "cytario.io/compute": "gpu" } },
    },
    defaultResources: {
      cpu: "2000m",
      memory: "8Gi",
      gpu: 1,
      platform: "KUBERNETES",
    },
    maxResources: {
      cpu: "32",
      memory: "256Gi",
      gpu: 8,
      platform: "KUBERNETES",
    },
  };
  expect(session.jobQueueArn).toBeUndefined();
  expect(session.jobRoleArn).toBeUndefined();
  expect(session.executionRoleArn).toBeUndefined();
  expect(session.logGroupName).toBeUndefined();
  expect(session.providerConfig?.namespace).toBe("cytario-jobs");
});

test("an AWS session keeps satisfying the type with all its fields", () => {
  const awsSession: ComputeRoleSession = {
    signedFetch: () => Promise.resolve(new Response(null, { status: 200 })),
    jobQueueArn: "arn:aws:batch:eu-central-1:825967678234:job-queue/gpu-queue",
    jobRoleArn: "arn:aws:iam::825967678234:role/cytario/cp/job",
    executionRoleArn: "arn:aws:iam::825967678234:role/cytario/cp/exec",
    imagePullSecretRef: null,
    logGroupName: "/aws/batch/cytario-compute/test",
  };
  expect(awsSession.jobQueueArn).toContain("job-queue/gpu-queue");
  expect(awsSession.providerConfig).toBeUndefined();
});

test("the resource envelope accepts the KUBERNETES platform", () => {
  const envelope: import("../host").ProviderResourceEnvelope = {
    cpu: "2000m",
    memory: "8Gi",
    platform: "KUBERNETES",
  };
  expect(envelope.platform).toBe("KUBERNETES");
});
