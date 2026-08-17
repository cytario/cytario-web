import { describe, expect, test } from "vitest";

import { mapResourceEnvelope } from "../resourceEnvelope";

describe("mapResourceEnvelope", () => {
  test("returns undefined for null", () => {
    expect(mapResourceEnvelope(null)).toBeUndefined();
  });

  test("returns undefined for non-object", () => {
    expect(mapResourceEnvelope("8Gi")).toBeUndefined();
    expect(mapResourceEnvelope(42)).toBeUndefined();
  });

  test("returns undefined for an empty object", () => {
    expect(mapResourceEnvelope({})).toBeUndefined();
  });

  test("passes through Kubernetes-quantity shape", () => {
    expect(
      mapResourceEnvelope({
        cpu: "2000m",
        memory: "8Gi",
        ephemeralStorage: "20Gi",
        gpu: 1,
        runtimeCapSeconds: 3600,
        platform: "EC2",
      }),
    ).toEqual({
      cpu: "2000m",
      memory: "8Gi",
      ephemeralStorage: "20Gi",
      gpu: 1,
      runtimeCapSeconds: 3600,
      platform: "EC2",
    });
  });

  test("translates legacy AWS-Batch shape (vcpus + MiB memory)", () => {
    expect(
      mapResourceEnvelope({
        vcpus: 4,
        memory: 16384,
        gpu: 1,
        runtimeCap: 7200,
      }),
    ).toEqual({
      cpu: "4",
      memory: "16384Mi",
      gpu: 1,
      runtimeCapSeconds: 7200,
    });
  });

  test("accepts legacy gpus alias", () => {
    expect(mapResourceEnvelope({ vcpus: 2, memory: 4096, gpus: 2 })).toEqual({
      cpu: "2",
      memory: "4096Mi",
      gpu: 2,
    });
  });

  test("accepts maxRuntime legacy alias", () => {
    expect(mapResourceEnvelope({ vcpus: 1, memory: 2048, maxRuntime: 1800 })).toEqual({
      cpu: "1",
      memory: "2048Mi",
      runtimeCapSeconds: 1800,
    });
  });

  test("accepts Fargate platform + supportedVcpuMemoryPairs", () => {
    expect(
      mapResourceEnvelope({
        platform: "FARGATE",
        supportedVcpuMemoryPairs: [
          ["2", "8Gi"],
          ["4", "16Gi"],
        ],
      }),
    ).toEqual({
      platform: "FARGATE",
      supportedVcpuMemoryPairs: [
        ["2", "8Gi"],
        ["4", "16Gi"],
      ],
    });
  });

  test("rejects non-integer GPU", () => {
    expect(mapResourceEnvelope({ memory: "4Gi", gpu: 1.5 })).toEqual({ memory: "4Gi" });
  });

  test("rejects negative GPU", () => {
    expect(mapResourceEnvelope({ memory: "4Gi", gpu: -1 })).toEqual({ memory: "4Gi" });
  });

  test("rejects zero memory", () => {
    expect(mapResourceEnvelope({ memory: 0 })).toBeUndefined();
  });

  test("filters invalid supportedVcpuMemoryPairs entries", () => {
    expect(
      mapResourceEnvelope({
        platform: "FARGATE",
        supportedVcpuMemoryPairs: [["2", "8Gi"], ["bad"], [1, 2]],
      }),
    ).toEqual({
      platform: "FARGATE",
      supportedVcpuMemoryPairs: [["2", "8Gi"]],
    });
  });

  test("accepts string vcpus", () => {
    expect(mapResourceEnvelope({ vcpus: "4", memory: 8192 })).toEqual({
      cpu: "4",
      memory: "8192Mi",
    });
  });

  test("ignores unknown fields", () => {
    expect(mapResourceEnvelope({ cpu: "2", memory: "4Gi", instanceType: "m5.large" })).toEqual({
      cpu: "2",
      memory: "4Gi",
    });
  });
});
