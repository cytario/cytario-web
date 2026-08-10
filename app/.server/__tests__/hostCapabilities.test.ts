import { prisma } from "../db/prisma";
import { hostCapabilities } from "../hostCapabilities";
import { withHostRequestContext } from "../hostRequestContext";
import type { HostRequestData } from "../hostRequestContext";
import type { Identity } from "@cytario/plugin-api";
import { noopHostCapabilities } from "~/lib/noopHostCapabilities";
import type { ProviderCatalog } from "~/utils/providerCatalog.schema";

const { getProviderCatalogMock, stsSendMock } = vi.hoisted(() => ({
  getProviderCatalogMock: vi.fn(),
  stsSendMock: vi.fn(),
}));

vi.mock("~/.server/providers/providerCatalog.server", () => ({
  getProviderCatalog: getProviderCatalogMock,
  resolveConnectionProvider: vi.fn(),
  invalidateProviderCatalogCache: vi.fn(),
  clearProviderCatalogCache: vi.fn(),
  findProviderConnection: vi.fn(),
  findProviderRole: vi.fn(),
}));

vi.mock("@aws-sdk/client-sts", () => ({
  STSClient: class {
    send = stsSendMock;
  },
  AssumeRoleWithWebIdentityCommand: class {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  },
}));

const EMPTY_CATALOG: ProviderCatalog = {
  providerConnections: [],
  providerRoles: [],
  computeProviders: [],
  computeRoles: [],
  appCatalogs: [],
};
const mockIdentity: Identity = {
  sub: "user-123",
  organization: "testcorp",
  organizationAttributes: {},
  groups: [],
  adminScopes: [],
};

const mockRequestData: HostRequestData = {
  user: {
    sub: "user-123",
    organization: "testcorp",
    organizationAttributes: {},
    groups: [],
    adminScopes: [],
  } as never,
  identity: mockIdentity,
  authTokens: { accessToken: "access", refreshToken: "refresh", idToken: "id" },
  sessionId: "session-123",
};

describe("HostCapabilities (SDS-CY-010097/010098/010099)", () => {
  beforeEach(() => {
    getProviderCatalogMock.mockResolvedValue(EMPTY_CATALOG);
  });

  test("connections throws when called outside a request context", async () => {
    await expect(hostCapabilities.connections()).rejects.toThrow("outside a request context");
  });

  test("computeConnections throws when called outside a request context", async () => {
    await expect(hostCapabilities.computeConnections()).rejects.toThrow(
      "outside a request context",
    );
  });

  test("catalogConnections throws when called outside a request context", async () => {
    await expect(hostCapabilities.catalogConnections()).rejects.toThrow(
      "outside a request context",
    );
  });

  test("catalogConnections projection carries allowedGroups (SRS-CY-39806/45107, SDS-CY-010097)", async () => {
    getProviderCatalogMock.mockResolvedValue({
      providerConnections: [],
      providerRoles: [],
      computeProviders: [],
      computeRoles: [],
      appCatalogs: [
        {
          id: "ac-1",
          displayName: "Harbor Catalog",
          registryEndpoint: "https://harbor.example.com",
          namespace: "cytario",
          accessAccountId: "robot$harbor+cytario",
          accessAccountSecret: "secret-token",
          enabled: true,
          status: "connected",
          allowedGroups: ["lab/team-a", "lab/team-b"],
        },
        {
          id: "ac-2",
          displayName: "Org-wide Catalog",
          registryEndpoint: "https://harbor2.example.com",
          namespace: "public",
          accessAccountId: "robot$harbor2+cytario",
          accessAccountSecret: "secret-token-2",
          enabled: true,
          status: "connected",
          allowedGroups: [],
        },
        {
          id: "ac-disabled",
          displayName: "Disabled Catalog",
          registryEndpoint: "https://harbor3.example.com",
          namespace: "disabled",
          accessAccountId: "robot$harbor3",
          accessAccountSecret: "secret-token-3",
          enabled: false,
          status: "connected",
          allowedGroups: ["lab/team-c"],
        },
      ],
    } satisfies ProviderCatalog);

    const projections = await withHostRequestContext(mockRequestData, async () =>
      hostCapabilities.catalogConnections(),
    );

    expect(projections).toHaveLength(2);
    expect(projections[0]).toMatchObject({
      id: "ac-1",
      name: "Harbor Catalog",
      registryEndpoint: "https://harbor.example.com",
      namespace: "cytario",
      allowedGroups: ["lab/team-a", "lab/team-b"],
    });
    expect(projections[1]).toMatchObject({
      id: "ac-2",
      name: "Org-wide Catalog",
      allowedGroups: [],
    });
    expect(projections.find((p) => p.id === "ac-disabled")).toBeUndefined();

    getProviderCatalogMock.mockReset();
  });

  test("connectionFetch throws when no matching catalog is found", () => {
    expect(() =>
      withHostRequestContext(mockRequestData, () =>
        hostCapabilities.connectionFetch("nonexistent", "https://harbor.example.com/v2/"),
      ),
    ).rejects.toThrow();
  });

  test("objectStore returns an ObjectStore instance", () => {
    const store = withHostRequestContext(mockRequestData, () => hostCapabilities.objectStore());
    expect(store).toBeDefined();
    expect(typeof store.put).toBe("function");
    expect(typeof store.get).toBe("function");
    expect(typeof store.delete).toBe("function");
    expect(typeof store.list).toBe("function");
  });

  test("assumeComputeRole threads jobQueueArn and the job/execution role ARNs + pull-secret ref from the provider record (SRS-CY-45107/49110)", async () => {
    const jobQueueArn = "arn:aws:batch:eu-central-1:825967678234:job-queue/gpu-queue";
    const jobRoleArn = "arn:aws:iam::825967678234:role/cytario/cp/job";
    const executionRoleArn = "arn:aws:iam::825967678234:role/cytario/cp/exec";
    const imagePullSecretRef =
      "arn:aws:secretsmanager:eu-central-1:825967678234:secret:cytario-compute/cp-1/registry-pull";
    getProviderCatalogMock.mockResolvedValue({
      providerConnections: [],
      providerRoles: [],
      computeProviders: [
        {
          id: "cp-1",
          providerConnectionId: "pc-1",
          displayName: "GPU Cluster",
          region: "eu-central-1",
          type: "AWS_BATCH",
          typeSpecific: {
            jobQueueArn,
            jobRoleArn,
            executionRoleArn,
            imagePullSecretRef,
            logGroupName: "/aws/batch/cytario-compute/test",
            defaultResources: null,
          },
          status: "connected",
        },
      ],
      computeRoles: [
        {
          id: "cr-1",
          computeProviderId: "cp-1",
          roleArn: "arn:aws:iam::825967678234:role/cytario-cp-submit",
          name: "submit",
        },
      ],
      appCatalogs: [],
    });
    stsSendMock.mockResolvedValue({
      Credentials: {
        AccessKeyId: "AKIA",
        SecretAccessKey: "secret",
        SessionToken: "token",
      },
    });

    const session = await withHostRequestContext(mockRequestData, () =>
      hostCapabilities.assumeComputeRole(),
    );

    expect(session.jobQueueArn).toBe(jobQueueArn);
    expect(session.jobRoleArn).toBe(jobRoleArn);
    expect(session.executionRoleArn).toBe(executionRoleArn);
    expect(session.imagePullSecretRef).toBe(imagePullSecretRef);
    expect(typeof session.signedFetch).toBe("function");
  });

  test("assumeComputeRole returns a null imagePullSecretRef when the provider has no connected catalog", async () => {
    getProviderCatalogMock.mockResolvedValue({
      providerConnections: [],
      providerRoles: [],
      computeProviders: [
        {
          id: "cp-1",
          providerConnectionId: "pc-1",
          displayName: "GPU Cluster",
          region: "eu-central-1",
          type: "AWS_BATCH",
          typeSpecific: {
            jobQueueArn: "arn:aws:batch:eu-central-1:825967678234:job-queue/gpu-queue",
            jobRoleArn: "arn:aws:iam::825967678234:role/cytario/cp/job",
            executionRoleArn: "arn:aws:iam::825967678234:role/cytario/cp/exec",
            imagePullSecretRef: null,
            logGroupName: "/aws/batch/cytario-compute/test",
            defaultResources: null,
          },
          status: "connected",
        },
      ],
      computeRoles: [
        {
          id: "cr-1",
          computeProviderId: "cp-1",
          roleArn: "arn:aws:iam::825967678234:role/cytario-cp-submit",
          name: "submit",
        },
      ],
      appCatalogs: [],
    });
    stsSendMock.mockResolvedValue({
      Credentials: {
        AccessKeyId: "AKIA",
        SecretAccessKey: "secret",
        SessionToken: "token",
      },
    });

    const session = await withHostRequestContext(mockRequestData, () =>
      hostCapabilities.assumeComputeRole(),
    );

    expect(session.imagePullSecretRef).toBeNull();
    expect(session.jobQueueArn).toBe("arn:aws:batch:eu-central-1:825967678234:job-queue/gpu-queue");
  });

  test("exchangeToken throws when the job broker client is not configured", async () => {
    await expect(
      withHostRequestContext(mockRequestData, async () => hostCapabilities.exchangeToken()),
    ).rejects.toThrow();
  });

  test("revokeGrant throws on an empty offlineSessionId", async () => {
    await expect(
      withHostRequestContext(mockRequestData, async () => hostCapabilities.revokeGrant("")),
    ).rejects.toThrow("non-empty offlineSessionId");
  });

  test("jobLedger returns a JobLedger instance", () => {
    const ledger = withHostRequestContext(mockRequestData, () => hostCapabilities.jobLedger());
    expect(ledger).toBeDefined();
    expect(typeof ledger.record).toBe("function");
    expect(typeof ledger.lookup).toBe("function");
    expect(typeof ledger.list).toBe("function");
    expect(typeof ledger.listAll).toBe("function");
    expect(typeof ledger.remove).toBe("function");
  });

  test("jobLedger methods throw outside a request context", async () => {
    const ledger = hostCapabilities.jobLedger();
    await expect(
      ledger.record({ jobId: "j1", offlineSessionId: "s1", organization: "o", owner: "u" }),
    ).rejects.toThrow("outside a request context");
    await expect(ledger.lookup("j1")).rejects.toThrow("outside a request context");
    await expect(ledger.list()).rejects.toThrow("outside a request context");
    await expect(ledger.listAll()).rejects.toThrow("outside a request context");
    await expect(ledger.remove("j1")).rejects.toThrow("outside a request context");
  });
});

describe("JobLedger tenant isolation (SDS-CY-080900/010099)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test("record injects the session org and ignores the caller-supplied organization", async () => {
    const create = vi.spyOn(prisma.jobLedgerEntry, "create").mockResolvedValue({} as never);
    await withHostRequestContext(mockRequestData, async () => {
      await hostCapabilities.jobLedger().record({
        jobId: "job-1",
        offlineSessionId: "sess-1",
        organization: "WRONG_ORG",
        owner: "user-123",
      });
    });
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]?.[0]).toMatchObject({
      data: {
        jobId: "job-1",
        offlineSessionId: "sess-1",
        organization: "testcorp",
        owner: "user-123",
      },
    });
  });

  test("lookup filters by the session org (tenant pre-filter)", async () => {
    const findFirst = vi.spyOn(prisma.jobLedgerEntry, "findFirst").mockResolvedValue(null);
    await withHostRequestContext(mockRequestData, async () => {
      const result = await hostCapabilities.jobLedger().lookup("job-1");
      expect(result).toBeNull();
    });
    expect(findFirst).toHaveBeenCalledTimes(1);
    expect(findFirst.mock.calls[0]?.[0]).toMatchObject({
      where: { organization: "testcorp", jobId: "job-1" },
    });
  });

  test("lookup returns a JobRecord when the row exists", async () => {
    vi.spyOn(prisma.jobLedgerEntry, "findFirst").mockResolvedValue({
      jobId: "job-1",
      offlineSessionId: "sess-1",
      organization: "testcorp",
      owner: "user-123",
    } as never);
    await withHostRequestContext(mockRequestData, async () => {
      const result = await hostCapabilities.jobLedger().lookup("job-1");
      expect(result).toEqual({
        jobId: "job-1",
        offlineSessionId: "sess-1",
        organization: "testcorp",
        owner: "user-123",
      });
    });
  });

  test("remove filters by the session org (tenant pre-filter)", async () => {
    const deleteMany = vi
      .spyOn(prisma.jobLedgerEntry, "deleteMany")
      .mockResolvedValue({ count: 1 } as never);
    await withHostRequestContext(mockRequestData, async () => {
      await hostCapabilities.jobLedger().remove("job-1");
    });
    expect(deleteMany).toHaveBeenCalledTimes(1);
    expect(deleteMany.mock.calls[0]?.[0]).toMatchObject({
      where: { organization: "testcorp", jobId: "job-1" },
    });
  });

  test("list filters by the session org and returns rows in insertion order", async () => {
    const findMany = vi.spyOn(prisma.jobLedgerEntry, "findMany").mockResolvedValue([
      { jobId: "job-1", offlineSessionId: "sess-1", organization: "testcorp", owner: "u1" },
      { jobId: "job-2", offlineSessionId: "sess-2", organization: "testcorp", owner: "u2" },
    ] as never);
    const result = await withHostRequestContext(mockRequestData, async () =>
      hostCapabilities.jobLedger().list(),
    );
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany.mock.calls[0]?.[0]).toMatchObject({
      where: { organization: "testcorp" },
      orderBy: { createdAt: "asc" },
    });
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      jobId: "job-1",
      offlineSessionId: "sess-1",
      organization: "testcorp",
      owner: "u1",
    });
  });

  test("listAll is org-agnostic — no organization pre-filter (reconciler cross-org scan, SRS-CY-416106)", async () => {
    const findMany = vi.spyOn(prisma.jobLedgerEntry, "findMany").mockResolvedValue([
      { jobId: "job-1", offlineSessionId: "sess-1", organization: "testcorp", owner: "u1" },
      { jobId: "job-2", offlineSessionId: "sess-2", organization: "othercorp", owner: "u2" },
    ] as never);
    const result = await withHostRequestContext(mockRequestData, async () =>
      hostCapabilities.jobLedger().listAll(),
    );
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany.mock.calls[0]?.[0]).toMatchObject({
      orderBy: { createdAt: "asc" },
    });
    expect(findMany.mock.calls[0]?.[0]).not.toHaveProperty("where");
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.organization)).toEqual(["testcorp", "othercorp"]);
  });

  test("listAll still requires a request context (throws outside one)", async () => {
    await expect(hostCapabilities.jobLedger().listAll()).rejects.toThrow(
      "outside a request context",
    );
  });

  test("assumeComputeRole(org) mints for the passed org, overriding the context org", async () => {
    getProviderCatalogMock.mockResolvedValue({
      providerConnections: [],
      providerRoles: [],
      computeProviders: [
        {
          id: "cp-1",
          providerConnectionId: "pc-1",
          displayName: "GPU Cluster",
          region: "eu-central-1",
          type: "AWS_BATCH",
          typeSpecific: {
            jobQueueArn: "arn:aws:batch:eu-central-1:825967678234:job-queue/gpu-queue",
            jobRoleArn: "arn:aws:iam::825967678234:role/cytario/cp/job",
            executionRoleArn: "arn:aws:iam::825967678234:role/cytario/cp/exec",
            imagePullSecretRef: null,
            logGroupName: "/aws/batch/cytario-compute/test",
            defaultResources: null,
          },
          status: "connected",
        },
      ],
      computeRoles: [
        {
          id: "cr-1",
          computeProviderId: "cp-1",
          roleArn: "arn:aws:iam::825967678234:role/cytario-cp-submit",
          name: "submit",
        },
      ],
      appCatalogs: [],
    });
    stsSendMock.mockResolvedValue({
      Credentials: { AccessKeyId: "AKIA", SecretAccessKey: "secret", SessionToken: "token" },
    });

    await withHostRequestContext(mockRequestData, async () => {
      await hostCapabilities.assumeComputeRole("othercorp");
    });

    expect(getProviderCatalogMock).toHaveBeenCalledWith("othercorp", "access");
  });

  test("assumeComputeRole() with no arg uses the context org (session path)", async () => {
    getProviderCatalogMock.mockResolvedValue({
      providerConnections: [],
      providerRoles: [],
      computeProviders: [
        {
          id: "cp-1",
          providerConnectionId: "pc-1",
          displayName: "GPU Cluster",
          region: "eu-central-1",
          type: "AWS_BATCH",
          typeSpecific: {
            jobQueueArn: "arn:aws:batch:eu-central-1:825967678234:job-queue/gpu-queue",
            jobRoleArn: "arn:aws:iam::825967678234:role/cytario/cp/job",
            executionRoleArn: "arn:aws:iam::825967678234:role/cytario/cp/exec",
            imagePullSecretRef: null,
            logGroupName: "/aws/batch/cytario-compute/test",
            defaultResources: null,
          },
          status: "connected",
        },
      ],
      computeRoles: [
        {
          id: "cr-1",
          computeProviderId: "cp-1",
          roleArn: "arn:aws:iam::825967678234:role/cytario-cp-submit",
          name: "submit",
        },
      ],
      appCatalogs: [],
    });
    stsSendMock.mockResolvedValue({
      Credentials: { AccessKeyId: "AKIA", SecretAccessKey: "secret", SessionToken: "token" },
    });
    await withHostRequestContext(mockRequestData, async () => {
      await hostCapabilities.assumeComputeRole();
    });
    expect(getProviderCatalogMock).toHaveBeenCalledWith("testcorp", "access");
  });

  test("assumeComputeRole throws when neither an override nor a context org is present (deployment-secret path)", async () => {
    const noOrgData: HostRequestData = {
      ...mockRequestData,
      user: { ...mockRequestData.user, organization: undefined } as never,
    };
    await expect(
      withHostRequestContext(noOrgData, async () => hostCapabilities.assumeComputeRole()),
    ).rejects.toThrow("Active organization missing from request context");
  });

  test("record throws when the session has no active organization", async () => {
    const noOrgData: HostRequestData = {
      ...mockRequestData,
      user: { ...mockRequestData.user, organization: undefined } as never,
    };
    await expect(
      withHostRequestContext(noOrgData, async () =>
        hostCapabilities
          .jobLedger()
          .record({ jobId: "j1", offlineSessionId: "s1", organization: "x", owner: "u" }),
      ),
    ).rejects.toThrow("Active organization missing");
  });
});

describe("noopHostCapabilities (client-side sink)", () => {
  test("all methods reject or throw with server-only message", async () => {
    await expect(noopHostCapabilities.connections()).rejects.toThrow("server-only");
    await expect(noopHostCapabilities.computeConnections()).rejects.toThrow("server-only");
    await expect(noopHostCapabilities.catalogConnections()).rejects.toThrow("server-only");
    await expect(noopHostCapabilities.connectionFetch("x", "x")).rejects.toThrow("server-only");
    expect(() => noopHostCapabilities.objectStore()).toThrow("server-only");
    await expect(noopHostCapabilities.assumeComputeRole()).rejects.toThrow("server-only");
    await expect(noopHostCapabilities.exchangeToken()).rejects.toThrow("server-only");
    await expect(noopHostCapabilities.revokeGrant("sess-1")).rejects.toThrow("server-only");
    expect(() => noopHostCapabilities.jobLedger()).toThrow("server-only");
  });
});
