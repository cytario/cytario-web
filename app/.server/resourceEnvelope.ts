import type { ProviderResourceEnvelope } from "@cytario/plugin-api";

/**
 * Maps a raw `defaultResources` / `maxResources` JSON object from the
 * compute-provider record (SRS-CY-49110) onto the provider-neutral
 * `ProviderResourceEnvelope` (SRS-CY-415110).
 *
 * The admin-portal stores the envelope as a loose JSON object. Two shapes
 * are tolerated:
 *
 * - **Kubernetes-quantity shape** (preferred, post-C-416): `{ cpu: "2000m",
 *   memory: "8Gi", ephemeralStorage: "20Gi", gpu: 1, runtimeCapSeconds:
 *   3600, platform: "EC2" }`. Passed through unchanged.
 * - **Legacy AWS-Batch shape** (pre-C-416 admin-portal): `{ vcpus: 4,
 *   memory: 16384, gpu: 1, runtimeCap: 3600 }` where `memory` is a MiB
 *   integer and `vcpus` is a whole-core count. Translated to the
 *   Kubernetes-quantity shape (`cpu: "4"`, `memory: "16384Mi"`, …).
 *
 * Returns `undefined` when `raw` is null, not an object, or carries no
 * recognized field — the plugin then treats the envelope as absent
 * (no provider default / no known ceiling).
 */
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

  // Memory: accept Kubernetes quantity ("8Gi") or legacy MiB integer under
  // `memory`. A bare number is treated as MiB and rendered as `${n}Mi`.
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

  // Return undefined when no recognized field was populated — the plugin
  // treats an empty envelope as "no provider default / no known ceiling".
  if (Object.keys(envelope).length === 0) return undefined;
  return envelope;
}
