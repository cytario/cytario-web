import type { ProviderResourceEnvelope } from "@cytario/plugin-api";

// Tolerates both the Kubernetes-quantity shape ({ cpu: "2000m", memory: "8Gi",
// ... }) and the admin-portal shape ({ vcpu: 4, memory: 16384, gpuCount: 1 })
// where `memory` is a MiB integer and the CPU count is a whole number; the
// latter is translated to the former.
export function mapResourceEnvelope(raw: unknown): ProviderResourceEnvelope | undefined {
  if (raw === null || typeof raw !== "object") return undefined;
  const obj = raw as Record<string, unknown>;

  const envelope: ProviderResourceEnvelope = {};

  // CPU: accept Kubernetes quantity ("2000m", "2") or a whole-core integer
  // under `cpu`, or the legacy `vcpus` / the admin-portal `vcpu`. The first
  // *usable* alias wins, so an unusable value does not shadow a later one.
  const cpuRaw = [obj.cpu, obj.vcpus, obj.vcpu].find(
    (v) => typeof v === "string" || (typeof v === "number" && Number.isInteger(v)),
  );
  if (typeof cpuRaw === "string") {
    envelope.cpu = cpuRaw;
  } else if (typeof cpuRaw === "number") {
    envelope.cpu = String(cpuRaw);
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

  // GPU: integer count. Accept `gpu` (preferred), `gpus` or the admin-portal
  // `gpuCount`; as with CPU, the first usable alias wins.
  const gpuRaw = [obj.gpu, obj.gpus, obj.gpuCount].find(
    (v) => typeof v === "number" && Number.isInteger(v) && v >= 0,
  );
  if (typeof gpuRaw === "number") {
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

  // Memory ladder: ascending Kubernetes-quantity rungs (K8s shape) or the
  // admin-portal `memorySteps` / `memoryLadderMiB` aliases (MiB integers).
  const stepsRaw =
    typeof obj.memorySteps === "string"
      ? obj.memorySteps
      : typeof obj.memoryLadder === "string"
        ? obj.memoryLadder
        : undefined;
  if (stepsRaw !== undefined && stepsRaw.trim() !== "") {
    const steps = stepsRaw
      .split(",")
      .map((step) => step.trim())
      .filter((step) => step !== "");
    if (steps.length > 0) envelope.memorySteps = steps;
  } else if (Array.isArray(obj.memoryLadder)) {
    const steps: string[] = [];
    for (const rung of obj.memoryLadder) {
      if (typeof rung === "string" && rung.trim() !== "") {
        steps.push(rung.trim());
      } else if (typeof rung === "number" && Number.isInteger(rung) && rung > 0) {
        steps.push(`${rung}Mi`);
      }
    }
    if (steps.length > 0) envelope.memorySteps = steps;
  }

  if (Object.keys(envelope).length === 0) return undefined;
  return envelope;
}
