import type { ProviderResourceEnvelope } from "@cytario/plugin-api";

// Tolerates both the Kubernetes-quantity shape ({ cpu: "2000m", memory: "8Gi",
// ... }) and the legacy AWS-Batch shape ({ vcpus: 4, memory: 16384 }) where
// `memory` is a MiB integer and `vcpus` a whole-core count; the latter is
// translated to the former.
export function mapResourceEnvelope(raw: unknown): ProviderResourceEnvelope | undefined {
  if (raw === null || typeof raw !== "object") return undefined;
  const obj = raw as Record<string, unknown>;

  const envelope: ProviderResourceEnvelope = {};

  // CPU: accept Kubernetes quantity ("2000m", "2") or legacy whole-core
  // integer under `vcpus` / `cpu`.
  if (typeof obj.cpu === "string") {
    envelope.cpu = obj.cpu;
  } else if (typeof obj.vcpus === "number" && Number.isInteger(obj.vcpus)) {
    envelope.cpu = String(obj.vcpus);
  } else if (typeof obj.vcpus === "string") {
    envelope.cpu = obj.vcpus;
  }

  // Memory: a bare number is treated as MiB and rendered as `${n}Mi`.
  if (typeof obj.memory === "string") {
    envelope.memory = obj.memory;
  } else if (typeof obj.memory === "number" && obj.memory > 0) {
    envelope.memory = `${obj.memory}Mi`;
  }

  // Ephemeral storage: Kubernetes quantity only (no legacy field).
  if (typeof obj.ephemeralStorage === "string") {
    envelope.ephemeralStorage = obj.ephemeralStorage;
  }

  // GPU: integer count. Accept `gpu` (preferred) or `gpus` (legacy).
  const gpuRaw = obj.gpu ?? obj.gpus;
  if (typeof gpuRaw === "number" && Number.isInteger(gpuRaw) && gpuRaw >= 0) {
    envelope.gpu = gpuRaw;
  }

  // Runtime cap: seconds. Accept `runtimeCapSeconds` (preferred) or
  // `runtimeCap` / `maxRuntime` (legacy).
  const capRaw = obj.runtimeCapSeconds ?? obj.runtimeCap ?? obj.maxRuntime;
  if (typeof capRaw === "number" && capRaw > 0) {
    envelope.runtimeCapSeconds = capRaw;
  }

  // Platform: accept the enum string.
  if (obj.platform === "EC2" || obj.platform === "FARGATE") {
    envelope.platform = obj.platform;
  }

  // Fargate VCPU/MEMORY pairs: array of [cpu, memory] string tuples.
  if (Array.isArray(obj.supportedVcpuMemoryPairs)) {
    const pairs: [string, string][] = [];
    for (const pair of obj.supportedVcpuMemoryPairs) {
      if (
        Array.isArray(pair) &&
        pair.length === 2 &&
        typeof pair[0] === "string" &&
        typeof pair[1] === "string"
      ) {
        pairs.push([pair[0], pair[1]]);
      }
    }
    if (pairs.length > 0) envelope.supportedVcpuMemoryPairs = pairs;
  }

  if (Object.keys(envelope).length === 0) return undefined;
  return envelope;
}
