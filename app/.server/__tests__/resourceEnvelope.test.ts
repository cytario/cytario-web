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

  test("maps an ascending memory ladder from a comma-separated string", () => {
    expect(
      mapResourceEnvelope({
        memory: "16Gi",
        memorySteps: "16Gi, 32Gi,64Gi ,192Gi",
      }),
    ).toEqual({
      memory: "16Gi",
      memorySteps: ["16Gi", "32Gi", "64Gi", "192Gi"],
    });
  });

  test("maps an array-of-quantities memorySteps ladder (admin-portal shape)", () => {
    expect(
      mapResourceEnvelope({
        memory: 196608,
        memorySteps: ["16Gi", "32Gi", "64Gi"],
      }),
    ).toEqual({
      memory: "196608Mi",
      memorySteps: ["16Gi", "32Gi", "64Gi"],
    });
  });

  test("maps an array rung that is a positive MiB integer to an Mi-quantity", () => {
    expect(
      mapResourceEnvelope({
        memorySteps: ["16Gi", 32768, "64Gi"],
      }),
    ).toEqual({
      memorySteps: ["16Gi", "32768Mi", "64Gi"],
    });
  });

  test("skips junk rungs inside a memorySteps array", () => {
    expect(
      mapResourceEnvelope({
        memory: "16Gi",
        memorySteps: ["16Gi", "", null, 1.5, -1, 0, "32Gi"],
      }),
    ).toEqual({
      memory: "16Gi",
      memorySteps: ["16Gi", "32Gi"],
    });
  });

  test("an all-junk or empty memorySteps array leaves the ladder unset", () => {
    expect(mapResourceEnvelope({ memory: "16Gi", memorySteps: [] })).toEqual({
      memory: "16Gi",
    });
    expect(mapResourceEnvelope({ memory: "16Gi", memorySteps: ["", "  "] })).toEqual({
      memory: "16Gi",
    });
  });

  test("maps an admin-portal integer MiB ladder to Mi-quantities", () => {
    expect(
      mapResourceEnvelope({
        memoryLadder: [16384, 32768, 65536],
      }),
    ).toEqual({
      memorySteps: ["16384Mi", "32768Mi", "65536Mi"],
    });
  });

  test("tolerates ladder absence and filters unusable rungs", () => {
    expect(mapResourceEnvelope({ memory: "16Gi" })).toEqual({ memory: "16Gi" });
    expect(mapResourceEnvelope({ memorySteps: "" })).toBeUndefined();
    expect(mapResourceEnvelope({ memorySteps: " , ," })).toBeUndefined();
    expect(mapResourceEnvelope({ memoryLadder: [0, -1] })).toBeUndefined();
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

  test("accepts the admin-portal shape (vcpu + gpuCount + MiB memory)", () => {
    expect(
      mapResourceEnvelope({
        instanceType: "g4dn.2xlarge",
        vcpu: 8,
        memory: 32768,
        gpuCount: 1,
        maxRuntime: 14400,
      }),
    ).toEqual({
      cpu: "8",
      memory: "32768Mi",
      gpu: 1,
      runtimeCapSeconds: 14400,
    });
  });

  test("maps the same admin-portal shape for a maxResources blob", () => {
    expect(
      mapResourceEnvelope({
        instanceType: "g4dn.12xlarge",
        vcpu: 48,
        memory: 196608,
        gpuCount: 4,
        maxRuntime: 86400,
      }),
    ).toEqual({
      cpu: "48",
      memory: "196608Mi",
      gpu: 4,
      runtimeCapSeconds: 86400,
    });
  });

  test("accepts a partial admin-portal blob", () => {
    expect(mapResourceEnvelope({ vcpu: "8", gpuCount: 2 })).toEqual({
      cpu: "8",
      gpu: 2,
    });
    expect(mapResourceEnvelope({ gpuCount: 0 })).toEqual({ gpu: 0 });
  });

  test("prefers cpu over vcpu and gpu over gpuCount", () => {
    expect(mapResourceEnvelope({ cpu: "2000m", vcpu: 4, gpu: 1, gpuCount: 2 })).toEqual({
      cpu: "2000m",
      gpu: 1,
    });
  });

  test("rejects a non-integer vcpu and gpuCount", () => {
    expect(mapResourceEnvelope({ vcpu: 1.5, memory: "4Gi", gpuCount: 1.5 })).toEqual({
      memory: "4Gi",
    });
  });

  test("an unusable alias does not shadow a usable one", () => {
    expect(mapResourceEnvelope({ cpu: 1.5, vcpus: 4 })).toEqual({ cpu: "4" });
    expect(mapResourceEnvelope({ cpu: true, vcpu: 2 })).toEqual({ cpu: "2" });
    expect(mapResourceEnvelope({ gpu: 1.5, gpuCount: 3 })).toEqual({ gpu: 3 });
  });

  test("ignores unknown fields", () => {
    expect(mapResourceEnvelope({ cpu: "2", memory: "4Gi", instanceType: "m5.large" })).toEqual({
      cpu: "2",
      memory: "4Gi",
    });
  });
});
