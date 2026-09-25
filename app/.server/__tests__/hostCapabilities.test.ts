import { prisma } from "../db/prisma";
import { hostCapabilities } from "../hostCapabilities";
import { withHostRequestContext } from "../hostRequestContext";
import type { HostRequestData } from "../hostRequestContext";
import type { Identity } from "@cytario/plugin-api";
import { noopHostCapabilities } from "~/lib/noopHostCapabilities";
import type { ProviderCatalog } from "~/utils/providerCatalog.schema";

const {
  getProviderCatalogMock,
  resolveConnectionProviderMock,
  resolveConnectionProviderWithGrantsMock,
  pickGrantForUserMock,
  stsSendMock,
} = vi.hoisted(() => ({
  getProviderCatalogMock: vi.fn(),
  resolveConnectionProviderMock: vi.fn(),
  resolveConnectionProviderWithGrantsMock: vi.fn(),
  pickGrantForUserMock: vi.fn(),
  stsSendMock: vi.fn(),
}));

vi.mock("~/.server/providers/providerCatalog.server", () => ({
  getProviderCatalog: getProviderCatalogMock,
  resolveConnectionProvider: resolveConnectionProviderMock,
  resolveConnectionProviderWithGrants: resolveConnectionProviderWithGrantsMock,
  invalidateProviderCatalogCache: vi.fn(),
  clearProviderCatalogCache: vi.fn(),
  findProviderConnection: vi.fn(),
}));

vi.mock("~/.server/auth/getSessionCredentials", () => ({
  pickGrantForUser: pickGrantForUserMock,
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
          registryKind: "harbor",
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
          registryKind: "harbor",
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
          registryKind: "harbor",
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

  test("catalogConnections projection carries registryKind + credentialMode (SDS-CY-080201 / SRS-CY-414102)", async () => {
    getProviderCatalogMock.mockResolvedValue({
      providerConnections: [],
      providerRoles: [],
      computeProviders: [],
      computeRoles: [],
      appCatalogs: [
        {
          id: "ac-oci",
          displayName: "Public OCI Catalog",
          registryEndpoint: "https://registry.example.com",
          namespace: "cytario",
          // credential-less: no account id, no secret
          enabled: true,
          status: "connected",
          registryKind: "oci-catalog",
          allowedGroups: [],
        },
        {
          id: "ac-harbor",
          displayName: "Harbor Catalog",
          registryEndpoint: "https://harbor.example.com",
          namespace: "cytario",
          accessAccountId: "robot$harbor",
          accessAccountSecret: "secret-token",
          enabled: true,
          status: "connected",
          registryKind: "harbor",
          allowedGroups: [],
        },
      ],
    } satisfies ProviderCatalog);

    const projections = await withHostRequestContext(mockRequestData, async () =>
      hostCapabilities.catalogConnections(),
    );

    // The oci-catalog catalog carries its kind and the anonymous mode.
    expect(projections.find((p) => p.id === "ac-oci")).toMatchObject({
      registryKind: "oci-catalog",
      credentialMode: "anonymous",
    });
    // A kindless catalog defaults to harbor and carries the connection mode.
    expect(projections.find((p) => p.id === "ac-harbor")).toMatchObject({
      registryKind: "harbor",
      credentialMode: "connection",
    });

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
    expect(typeof store.size).toBe("function");
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

  test("catalogConnections projects both of two connected catalogs", async () => {
    getProviderCatalogMock.mockResolvedValue({
      providerConnections: [],
      providerRoles: [],
      computeProviders: [],
      computeRoles: [],
      appCatalogs: [
        {
          id: "ac-prod",
          displayName: "Prod Harbor",
          registryEndpoint: "https://harbor.example.com",
          namespace: "cytario",
          accessAccountId: "robot$harbor",
          accessAccountSecret: "secret-token",
          enabled: true,
          status: "connected",
          registryKind: "harbor",
          allowedGroups: [],
        },
        {
          id: "ac-dev",
          displayName: "Dev Harbor",
          registryEndpoint: "https://dev-harbor.example.com",
          namespace: "cytario-dev",
          accessAccountId: "robot$dev",
          accessAccountSecret: "dev-secret",
          enabled: true,
          status: "connected",
          registryKind: "harbor",
          allowedGroups: [],
        },
      ],
    } satisfies ProviderCatalog);

    const projections = await withHostRequestContext(mockRequestData, async () =>
      hostCapabilities.catalogConnections(),
    );

    expect(projections).toHaveLength(2);
    expect(projections.find((p) => p.id === "ac-prod")).toMatchObject({
      name: "Prod Harbor",
      registryEndpoint: "https://harbor.example.com",
      namespace: "cytario",
    });
    expect(projections.find((p) => p.id === "ac-dev")).toMatchObject({
      name: "Dev Harbor",
      registryEndpoint: "https://dev-harbor.example.com",
      namespace: "cytario-dev",
    });

    getProviderCatalogMock.mockReset();
  });

  test("assumeComputeRole threads the per-catalog registryPullSecrets map alongside the scalar ref", async () => {
    const registryPullSecrets = {
      "ac-prod":
        "arn:aws:secretsmanager:eu-central-1:825967678234:secret:cytario-compute/cp-1/registry-pull/ac-prod",
      "ac-dev":
        "arn:aws:secretsmanager:eu-central-1:825967678234:secret:cytario-compute/cp-1/registry-pull/ac-dev",
    };
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
            imagePullSecretRef:
              "arn:aws:secretsmanager:eu-central-1:825967678234:secret:cytario-compute/cp-1/registry-pull",
            registryPullSecrets,
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

    expect(session.registryPullSecrets).toEqual(registryPullSecrets);
    // The scalar stays as-is: the map is additive, not a replacement.
    expect(session.imagePullSecretRef).toBe(
      "arn:aws:secretsmanager:eu-central-1:825967678234:secret:cytario-compute/cp-1/registry-pull",
    );
  });

  test("assumeComputeRole omits the map entirely on a payload that predates it", async () => {
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
            imagePullSecretRef:
              "arn:aws:secretsmanager:eu-central-1:825967678234:secret:cytario-compute/cp-1/registry-pull",
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

    expect(session.registryPullSecrets).toBeUndefined();
    expect(session.imagePullSecretRef).toBe(
      "arn:aws:secretsmanager:eu-central-1:825967678234:secret:cytario-compute/cp-1/registry-pull",
    );
  });

  test("assumeComputeRole resolves a named provider id among the org's connected providers (SRS-CY-37302)", async () => {
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
            logGroupName: "/aws/batch/cytario-compute/cp-1",
            defaultResources: null,
          },
          status: "connected",
        },
        {
          id: "cp-2",
          providerConnectionId: "pc-1",
          displayName: "CPU Cluster",
          region: "eu-west-1",
          type: "AWS_BATCH",
          typeSpecific: {
            jobQueueArn: "arn:aws:batch:eu-west-1:825967678234:job-queue/cpu-queue",
            jobRoleArn: "arn:aws:iam::825967678234:role/cytario/cp2/job",
            executionRoleArn: "arn:aws:iam::825967678234:role/cytario/cp2/exec",
            imagePullSecretRef: null,
            logGroupName: "/aws/batch/cytario-compute/cp-2",
            defaultResources: null,
          },
          status: "connected",
        },
        {
          id: "cp-3",
          providerConnectionId: "pc-1",
          displayName: "Drifted Cluster",
          region: "eu-west-1",
          type: "AWS_BATCH",
          typeSpecific: {
            jobQueueArn: "arn:aws:batch:eu-west-1:825967678234:job-queue/drifted-queue",
            jobRoleArn: "arn:aws:iam::825967678234:role/cytario/cp3/job",
            executionRoleArn: "arn:aws:iam::825967678234:role/cytario/cp3/exec",
            imagePullSecretRef: null,
            logGroupName: "/aws/batch/cytario-compute/cp-3",
            defaultResources: null,
          },
          status: "drifted",
        },
      ],
      computeRoles: [
        {
          id: "cr-1",
          computeProviderId: "cp-1",
          roleArn: "arn:aws:iam::825967678234:role/cytario-cp-submit",
          name: "submit",
        },
        {
          id: "cr-2",
          computeProviderId: "cp-2",
          roleArn: "arn:aws:iam::825967678234:role/cytario-cp2-submit",
          name: "submit",
        },
        {
          id: "cr-3",
          computeProviderId: "cp-3",
          roleArn: "arn:aws:iam::825967678234:role/cytario-cp3-submit",
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
      hostCapabilities.assumeComputeRole("cp-2"),
    );

    expect(session.jobQueueArn).toBe("arn:aws:batch:eu-west-1:825967678234:job-queue/cpu-queue");
    // The STS mint used the named provider's submit role, not the first one's.
    expect(stsSendMock.mock.calls[0][0].input.RoleArn).toBe(
      "arn:aws:iam::825967678234:role/cytario-cp2-submit",
    );
  });

  test("assumeComputeRole rejects a provider id that is not a connected provider of the org (SRS-CY-44107 analog)", async () => {
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
        // cp-9 exists but is drifted — not selectable.
        {
          id: "cp-9",
          providerConnectionId: "pc-1",
          displayName: "Drifted Cluster",
          region: "eu-west-1",
          type: "AWS_BATCH",
          typeSpecific: {
            jobQueueArn: "arn:aws:batch:eu-west-1:825967678234:job-queue/drifted",
            jobRoleArn: "arn:aws:iam::825967678234:role/cytario/cp9/job",
            executionRoleArn: "arn:aws:iam::825967678234:role/cytario/cp9/exec",
            imagePullSecretRef: null,
            logGroupName: "/aws/batch/cytario-compute/cp-9",
            defaultResources: null,
          },
          status: "drifted",
        },
      ],
      computeRoles: [
        {
          id: "cr-1",
          computeProviderId: "cp-1",
          roleArn: "arn:aws:iam::825967678234:role/cytario-cp-submit",
          name: "submit",
        },
        {
          id: "cr-9",
          computeProviderId: "cp-9",
          roleArn: "arn:aws:iam::825967678234:role/cytario-cp9-submit",
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

    // Unknown id.
    await expect(
      withHostRequestContext(mockRequestData, () => hostCapabilities.assumeComputeRole("cp-404")),
    ).rejects.toThrow(/not a connected provider/);
    // Known id but not connected.
    await expect(
      withHostRequestContext(mockRequestData, () => hostCapabilities.assumeComputeRole("cp-9")),
    ).rejects.toThrow(/not a connected provider/);
    // The first connected provider still resolves when no id is named.
    const session = await withHostRequestContext(mockRequestData, () =>
      hostCapabilities.assumeComputeRole(),
    );
    expect(session.jobQueueArn).toBe("arn:aws:batch:eu-central-1:825967678234:job-queue/gpu-queue");
  });

  test("assumeComputeRole projects defaultResources and maxResources from the provider record (SRS-CY-415110)", async () => {
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
            defaultResources: { cpu: "2000m", memory: "8Gi", gpu: 1, runtimeCapSeconds: 3600 },
            maxResources: { cpu: "32", memory: "256Gi", gpu: 8, runtimeCapSeconds: 86400 },
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

    const session = await withHostRequestContext(mockRequestData, () =>
      hostCapabilities.assumeComputeRole(),
    );

    expect(session.defaultResources).toEqual({
      cpu: "2000m",
      memory: "8Gi",
      gpu: 1,
      runtimeCapSeconds: 3600,
    });
    expect(session.maxResources).toEqual({
      cpu: "32",
      memory: "256Gi",
      gpu: 8,
      runtimeCapSeconds: 86400,
    });
  });

  test("assumeComputeRole omits defaultResources/maxResources when the provider record carries null", async () => {
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
            maxResources: null,
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

    const session = await withHostRequestContext(mockRequestData, () =>
      hostCapabilities.assumeComputeRole(),
    );

    expect(session.defaultResources).toBeUndefined();
    expect(session.maxResources).toBeUndefined();
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

  test("keepAliveGrant no-ops on an empty offlineSessionId (never throws)", async () => {
    await expect(
      withHostRequestContext(mockRequestData, async () => hostCapabilities.keepAliveGrant("")),
    ).resolves.toBeUndefined();
  });

  test("jobLedger returns a JobLedger instance", () => {
    const ledger = withHostRequestContext(mockRequestData, () => hostCapabilities.jobLedger());
    expect(ledger).toBeDefined();
    expect(typeof ledger.record).toBe("function");
    expect(typeof ledger.update).toBe("function");
    expect(typeof ledger.lookup).toBe("function");
    expect(typeof ledger.list).toBe("function");
    expect(typeof ledger.listAll).toBe("function");
    expect(typeof ledger.remove).toBe("function");
  });

  test("jobLedger methods throw outside a request context", async () => {
    const ledger = hostCapabilities.jobLedger();
    await expect(
      ledger.record({
        id: "",
        status: "PENDING",
        batchId: "batch-1",
        offlineSessionId: "s1",
        jobToken: "tok",
        organization: "o",
        owner: "u",
        inputS3Uris: [],
        outputS3Uri: "",
        connectionId: "c1",
        roleArn: "",
        region: "",
        s3Endpoint: null,
      }),
    ).rejects.toThrow("outside a request context");
    await expect(ledger.update("row-1", {})).rejects.toThrow("outside a request context");
    await expect(ledger.lookup("j1")).rejects.toThrow("outside a request context");
    await expect(ledger.list()).rejects.toThrow("outside a request context");
    await expect(ledger.listAll()).rejects.toThrow("outside a request context");
    await expect(ledger.remove("row-1")).rejects.toThrow("outside a request context");
  });
});

describe("JobLedger tenant isolation (SDS-CY-080900/010099)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test("record injects the session org, resolves the role, and ignores the caller-supplied organization", async () => {
    const create = vi.spyOn(prisma.jobLedgerEntry, "create").mockResolvedValue({} as never);
    vi.spyOn(prisma.connectionConfig, "findFirst").mockResolvedValue({
      id: "c1",
      providerConnectionId: "pc-1",
      grants: [{ accessLevel: "read-only" }],
    } as never);
    getProviderCatalogMock.mockResolvedValueOnce(EMPTY_CATALOG);
    resolveConnectionProviderWithGrantsMock.mockReturnValueOnce({
      providerType: "aws",
      endpoint: null,
      region: "eu-central-1",
      allowsSharing: false,
      grants: [
        {
          scope: "*",
          roleArn: "arn:aws:iam::123:role/storage",
          accessLevel: "read-write",
        },
      ],
    });
    pickGrantForUserMock.mockReturnValueOnce({
      scope: "*",
      roleArn: "arn:aws:iam::123:role/storage",
      accessLevel: "read-write",
    });
    await withHostRequestContext(mockRequestData, async () => {
      await hostCapabilities.jobLedger().record({
        id: "",
        status: "PENDING",
        batchId: "batch-1",
        offlineSessionId: "sess-1",
        jobToken: "job-session-token",
        organization: "WRONG_ORG",
        owner: "user-123",
        inputS3Uris: ["s3://bucket/input/"],
        outputS3Uri: "s3://bucket/output/",
        connectionId: "c1",
        roleArn: "",
        region: "",
        s3Endpoint: null,
      });
    });
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]?.[0]).toMatchObject({
      data: {
        batchId: "batch-1",
        jobId: null,
        status: "PENDING",
        offlineSessionId: "sess-1",
        // The token is stored as its hash — the raw value never reaches the DB.
        jobTokenHash: expect.stringMatching(/^[0-9a-f]{64}$/),
        organization: "testcorp",
        owner: "user-123",
        inputS3Uris: ["s3://bucket/input/"],
        outputS3Uri: "s3://bucket/output/",
        connectionId: "c1",
        roleArn: "arn:aws:iam::123:role/storage",
        region: "eu-central-1",
        s3Endpoint: null,
      },
    });
  });

  test("record persists the named providerId after validating it against the org's connected providers (SRS-CY-37302)", async () => {
    const create = vi.spyOn(prisma.jobLedgerEntry, "create").mockResolvedValue({} as never);
    vi.spyOn(prisma.connectionConfig, "findFirst").mockResolvedValue({
      id: "c1",
      providerConnectionId: "pc-1",
      grants: [{ accessLevel: "read-only" }],
    } as never);
    getProviderCatalogMock.mockResolvedValueOnce(EMPTY_CATALOG);
    getProviderCatalogMock.mockResolvedValueOnce({
      providerConnections: [],
      providerRoles: [],
      computeProviders: [
        {
          id: "cp-2",
          providerConnectionId: "pc-1",
          displayName: "CPU Cluster",
          region: "eu-west-1",
          type: "AWS_BATCH",
          typeSpecific: {},
          status: "connected",
        },
      ],
      computeRoles: [],
      appCatalogs: [],
    });
    resolveConnectionProviderWithGrantsMock.mockReturnValueOnce({
      providerType: "aws",
      endpoint: null,
      region: "eu-central-1",
      allowsSharing: false,
      grants: [
        {
          scope: "*",
          roleArn: "arn:aws:iam::123:role/storage",
          accessLevel: "read-write",
        },
      ],
    });
    pickGrantForUserMock.mockReturnValueOnce({
      scope: "*",
      roleArn: "arn:aws:iam::123:role/storage",
      accessLevel: "read-write",
    });
    await withHostRequestContext(mockRequestData, async () => {
      await hostCapabilities.jobLedger().record({
        id: "",
        status: "PENDING",
        batchId: "batch-1",
        offlineSessionId: "sess-1",
        organization: "testcorp",
        owner: "user-123",
        providerId: "cp-2",
        inputS3Uris: [],
        outputS3Uri: "s3://bucket/output/",
        connectionId: "c1",
        roleArn: "",
        region: "",
        s3Endpoint: null,
        jobToken: "job-session-token",
      });
    });
    expect(create.mock.calls[0]?.[0]).toMatchObject({
      data: { providerId: "cp-2" },
    });
  });

  test("record rejects a providerId that is not a connected provider of the org", async () => {
    vi.spyOn(prisma.connectionConfig, "findFirst").mockResolvedValue({
      id: "c1",
      providerConnectionId: "pc-1",
      grants: [{ accessLevel: "read-only" }],
    } as never);
    // Two catalog reads happen per record: the connection-provider lookup
    // and the provider validation.
    getProviderCatalogMock.mockResolvedValueOnce(EMPTY_CATALOG);
    getProviderCatalogMock.mockResolvedValueOnce(EMPTY_CATALOG);
    resolveConnectionProviderWithGrantsMock.mockReturnValueOnce({
      providerType: "aws",
      endpoint: null,
      region: "eu-central-1",
      allowsSharing: false,
      grants: [
        {
          scope: "*",
          roleArn: "arn:aws:iam::123:role/storage",
          accessLevel: "read-write",
        },
      ],
    });
    pickGrantForUserMock.mockReturnValueOnce({
      scope: "*",
      roleArn: "arn:aws:iam::123:role/storage",
      accessLevel: "read-write",
    });
    const create = vi.spyOn(prisma.jobLedgerEntry, "create").mockResolvedValue({} as never);

    await withHostRequestContext(mockRequestData, async () => {
      await expect(
        hostCapabilities.jobLedger().record({
          id: "",
          status: "PENDING",
          batchId: "batch-1",
          offlineSessionId: "sess-1",
          organization: "testcorp",
          owner: "user-123",
          providerId: "cp-404",
          inputS3Uris: [],
          outputS3Uri: "s3://bucket/output/",
          connectionId: "c1",
          roleArn: "",
          region: "",
          s3Endpoint: null,
        }),
      ).rejects.toThrow(/not a connected provider/i);
    });
    expect(create).not.toHaveBeenCalled();
  });

  test("record persists a null providerId when the caller names none", async () => {
    const create = vi.spyOn(prisma.jobLedgerEntry, "create").mockResolvedValue({} as never);
    vi.spyOn(prisma.connectionConfig, "findFirst").mockResolvedValue({
      id: "c1",
      providerConnectionId: "pc-1",
      grants: [{ accessLevel: "read-only" }],
    } as never);
    getProviderCatalogMock.mockResolvedValueOnce(EMPTY_CATALOG);
    resolveConnectionProviderWithGrantsMock.mockReturnValueOnce({
      providerType: "aws",
      endpoint: null,
      region: "eu-central-1",
      allowsSharing: false,
      grants: [
        {
          scope: "*",
          roleArn: "arn:aws:iam::123:role/storage",
          accessLevel: "read-write",
        },
      ],
    });
    pickGrantForUserMock.mockReturnValueOnce({
      scope: "*",
      roleArn: "arn:aws:iam::123:role/storage",
      accessLevel: "read-write",
    });
    await withHostRequestContext(mockRequestData, async () => {
      await hostCapabilities.jobLedger().record({
        id: "",
        status: "PENDING",
        batchId: "batch-1",
        offlineSessionId: "sess-1",
        organization: "testcorp",
        owner: "user-123",
        inputS3Uris: [],
        outputS3Uri: "s3://bucket/output/",
        connectionId: "c1",
        roleArn: "",
        region: "",
        s3Endpoint: null,
        jobToken: "job-session-token",
      });
    });
    expect(create.mock.calls[0]?.[0]).toMatchObject({
      data: { providerId: null },
    });
  });

  test("record rejects when the submitting user can see no grant on the connection", async () => {
    vi.spyOn(prisma.connectionConfig, "findFirst").mockResolvedValue({
      id: "c1",
      providerConnectionId: "pc-1",
      grants: [{ accessLevel: "read-only" }],
    } as never);
    getProviderCatalogMock.mockResolvedValueOnce(EMPTY_CATALOG);
    resolveConnectionProviderWithGrantsMock.mockReturnValueOnce({
      providerType: "aws",
      endpoint: null,
      region: "eu-central-1",
      allowsSharing: false,
      grants: [
        {
          scope: "lab/team-a",
          roleArn: "arn:aws:iam::123:role/storage",
          accessLevel: "read-write",
        },
      ],
    });
    pickGrantForUserMock.mockReturnValueOnce(undefined);
    const create = vi.spyOn(prisma.jobLedgerEntry, "create").mockResolvedValue({} as never);

    await withHostRequestContext(mockRequestData, async () => {
      await expect(
        hostCapabilities.jobLedger().record({
          id: "",
          status: "PENDING",
          batchId: "batch-1",
          offlineSessionId: "sess-1",
          organization: "WRONG_ORG",
          owner: "user-123",
          inputS3Uris: [],
          outputS3Uri: "s3://bucket/output/",
          connectionId: "c1",
          roleArn: "",
          region: "",
          s3Endpoint: null,
        }),
      ).rejects.toThrow(/no grant/i);
    });
    expect(create).not.toHaveBeenCalled();
  });

  test("record returns the ledger row's own id and creates the row PENDING (SDS-CY-080903)", async () => {
    const create = vi
      .spyOn(prisma.jobLedgerEntry, "create")
      .mockResolvedValue({ id: "row-1" } as never);
    vi.spyOn(prisma.connectionConfig, "findFirst").mockResolvedValue({
      id: "c1",
      providerConnectionId: "pc-1",
      grants: [{ accessLevel: "read-only" }],
    } as never);
    getProviderCatalogMock.mockResolvedValueOnce(EMPTY_CATALOG);
    resolveConnectionProviderWithGrantsMock.mockReturnValueOnce({
      providerType: "aws",
      endpoint: null,
      region: "eu-central-1",
      allowsSharing: false,
      grants: [
        {
          scope: "*",
          roleArn: "arn:aws:iam::123:role/storage",
          accessLevel: "read-write",
        },
      ],
    });
    pickGrantForUserMock.mockReturnValueOnce({
      scope: "*",
      roleArn: "arn:aws:iam::123:role/storage",
      accessLevel: "read-write",
    });
    const returned = await withHostRequestContext(mockRequestData, async () =>
      hostCapabilities.jobLedger().record({
        id: "",
        status: "PENDING",
        batchId: "batch-1",
        offlineSessionId: "sess-1",
        jobToken: "job-session-token",
        organization: "testcorp",
        owner: "user-123",
        inputS3Uris: [],
        outputS3Uri: "s3://bucket/output/",
        connectionId: "c1",
        roleArn: "",
        region: "",
        s3Endpoint: null,
      }),
    );
    expect(returned).toEqual({ id: "row-1" });
    expect(create).toHaveBeenCalledTimes(1);
  });

  test("update applies the runtime-information patch org-prefiltered by the row id (SDS-CY-080903)", async () => {
    const updateMany = vi
      .spyOn(prisma.jobLedgerEntry, "updateMany")
      .mockResolvedValue({ count: 1 } as never);
    await withHostRequestContext(mockRequestData, async () => {
      await hostCapabilities
        .jobLedger()
        .update("row-1", { providerJobId: "job-1", status: "Queued" });
    });
    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(updateMany.mock.calls[0]?.[0]).toMatchObject({
      where: { id: "row-1", organization: "testcorp" },
      data: { jobId: "job-1", status: "Queued" },
    });
  });

  test("update sends only the patch fields it was given", async () => {
    const updateMany = vi
      .spyOn(prisma.jobLedgerEntry, "updateMany")
      .mockResolvedValue({ count: 1 } as never);
    await withHostRequestContext(mockRequestData, async () => {
      await hostCapabilities.jobLedger().update("row-1", { status: "Running" });
    });
    expect(updateMany.mock.calls[0]?.[0]).toMatchObject({
      data: { status: "Running" },
    });
    expect(updateMany.mock.calls[0]?.[0]?.data).not.toHaveProperty("jobId");
  });

  test("update throws when the row is absent from the organization (fail loud, never silent)", async () => {
    vi.spyOn(prisma.jobLedgerEntry, "updateMany").mockResolvedValue({ count: 0 } as never);
    await withHostRequestContext(mockRequestData, async () => {
      await expect(
        hostCapabilities.jobLedger().update("row-404", { status: "Queued" }),
      ).rejects.toThrow("not found in organization testcorp");
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
      id: "row-1",
      batchId: "batch-1",
      jobId: "job-1",
      status: "Queued",
      offlineSessionId: "sess-1",
      organization: "testcorp",
      owner: "user-123",
      inputS3Uris: ["s3://bucket/input/"],
      outputS3Uri: "s3://bucket/output/",
      connectionId: "c1",
      roleArn: "arn:aws:iam::123:role/storage",
      region: "eu-central-1",
      s3Endpoint: null,
    } as never);
    await withHostRequestContext(mockRequestData, async () => {
      const result = await hostCapabilities.jobLedger().lookup("job-1");
      expect(result).toEqual({
        id: "row-1",
        status: "Queued",
        jobId: "job-1",
        batchId: "batch-1",
        offlineSessionId: "sess-1",
        organization: "testcorp",
        owner: "user-123",
        inputS3Uris: ["s3://bucket/input/"],
        outputS3Uri: "s3://bucket/output/",
        connectionId: "c1",
        roleArn: "arn:aws:iam::123:role/storage",
        region: "eu-central-1",
        s3Endpoint: null,
      });
    });
  });

  test("remove filters by the session org (tenant pre-filter)", async () => {
    const findMany = vi
      .spyOn(prisma.jobLedgerEntry, "findMany")
      .mockResolvedValue([{ batchId: "batch-1" }] as never);
    const deleteMany = vi
      .spyOn(prisma.jobLedgerEntry, "deleteMany")
      .mockResolvedValue({ count: 1 } as never);
    vi.spyOn(prisma.jobGrantCredential, "deleteMany").mockResolvedValue({ count: 1 } as never);
    vi.spyOn(prisma.jobLedgerEntry, "count").mockResolvedValue(0 as never);

    await withHostRequestContext(mockRequestData, async () => {
      await hostCapabilities.jobLedger().remove("row-1");
    });

    expect(findMany).toHaveBeenCalledWith({
      where: { organization: "testcorp", id: "row-1" },
      select: { batchId: true },
    });
    expect(deleteMany).toHaveBeenCalledTimes(1);
    expect(deleteMany.mock.calls[0]?.[0]).toMatchObject({
      where: { organization: "testcorp", id: "row-1" },
    });
  });

  test("removing the last job of a batch collects the batch's credentials", async () => {
    vi.spyOn(prisma.jobLedgerEntry, "findMany").mockResolvedValue([
      { batchId: "batch-1" },
    ] as never);
    vi.spyOn(prisma.jobLedgerEntry, "deleteMany").mockResolvedValue({ count: 1 } as never);
    vi.spyOn(prisma.jobLedgerEntry, "count").mockResolvedValue(0 as never);
    const deleteCredentials = vi
      .spyOn(prisma.jobGrantCredential, "deleteMany")
      .mockResolvedValue({ count: 1 } as never);

    await withHostRequestContext(mockRequestData, async () => {
      await hostCapabilities.jobLedger().remove("row-1");
    });

    // Nothing left to mint with, so the encrypted refresh token goes too.
    // One statement guarded by the relation.
    expect(deleteCredentials).toHaveBeenCalledWith({
      where: { batchId: "batch-1", ledgerEntries: { none: {} } },
    });
  });

  test("the collection is scoped so a partially-complete batch retains its grant (SRS-CY-416108)", async () => {
    vi.spyOn(prisma.jobLedgerEntry, "findMany").mockResolvedValue([
      { batchId: "batch-1" },
    ] as never);
    vi.spyOn(prisma.jobLedgerEntry, "deleteMany").mockResolvedValue({ count: 1 } as never);
    // The sibling's row is still there, so the guarded delete matches nothing.
    const deleteCredentials = vi
      .spyOn(prisma.jobGrantCredential, "deleteMany")
      .mockResolvedValue({ count: 0 } as never);

    await withHostRequestContext(mockRequestData, async () => {
      await hostCapabilities.jobLedger().remove("row-1");
    });

    expect(deleteCredentials).toHaveBeenCalledWith({
      where: { batchId: "batch-1", ledgerEntries: { none: {} } },
    });
  });

  test("remove deletes by row id alone from the org-agnostic carve-out context (reconciler path)", async () => {
    vi.spyOn(prisma.jobLedgerEntry, "findMany").mockResolvedValue([
      { batchId: "batch-1" },
    ] as never);
    const deleteMany = vi
      .spyOn(prisma.jobLedgerEntry, "deleteMany")
      .mockResolvedValue({ count: 1 } as never);
    vi.spyOn(prisma.jobLedgerEntry, "count").mockResolvedValue(0 as never);
    vi.spyOn(prisma.jobGrantCredential, "deleteMany").mockResolvedValue({ count: 1 } as never);
    const orgAgnosticRequestData: HostRequestData = {
      ...mockRequestData,
      user: { ...mockRequestData.user, organization: undefined },
      identity: undefined,
    };
    await withHostRequestContext(orgAgnosticRequestData, async () => {
      await hostCapabilities.jobLedger().remove("row-1");
    });
    expect(deleteMany).toHaveBeenCalledTimes(1);
    const deleteArgs = deleteMany.mock.calls[0]?.[0] as { where?: Record<string, string> };
    expect(deleteArgs).toEqual({ where: { id: "row-1" } });
    expect(deleteArgs.where).not.toHaveProperty("organization");
  });

  test("list filters by the session org and returns rows in insertion order", async () => {
    const findMany = vi.spyOn(prisma.jobLedgerEntry, "findMany").mockResolvedValue([
      {
        id: "row-1",
        batchId: "batch-1",
        jobId: "job-1",
        status: "Queued",
        offlineSessionId: "sess-1",
        organization: "testcorp",
        owner: "u1",
        inputS3Uris: [],
        outputS3Uri: "",
        connectionId: "",
        roleArn: "",
        region: "",
        s3Endpoint: null,
      } as never,
      {
        id: "row-2",
        batchId: "batch-1",
        jobId: "job-2",
        status: "Running",
        offlineSessionId: "sess-2",
        organization: "testcorp",
        owner: "u2",
        inputS3Uris: [],
        outputS3Uri: "",
        connectionId: "",
        roleArn: "",
        region: "",
        s3Endpoint: null,
      } as never,
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
      id: "row-1",
      status: "Queued",
      jobId: "job-1",
      batchId: "batch-1",
      offlineSessionId: "sess-1",
      organization: "testcorp",
      owner: "u1",
      inputS3Uris: [],
      outputS3Uri: "",
      connectionId: "",
      roleArn: "",
      region: "",
      s3Endpoint: null,
    });
  });

  test("listAll is org-agnostic — no organization pre-filter (reconciler cross-org scan, SRS-CY-416106)", async () => {
    const findMany = vi.spyOn(prisma.jobLedgerEntry, "findMany").mockResolvedValue([
      {
        id: "row-1",
        batchId: "batch-1",
        jobId: "job-1",
        status: "Queued",
        offlineSessionId: "sess-1",
        organization: "testcorp",
        owner: "u1",
        inputS3Uris: [],
        outputS3Uri: "",
      } as never,
      {
        id: "row-2",
        batchId: "batch-1",
        jobId: "job-2",
        status: "Running",
        offlineSessionId: "sess-2",
        organization: "othercorp",
        owner: "u2",
        inputS3Uris: [],
        outputS3Uri: "",
      } as never,
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

  test("list omits jobId on a PENDING row that carries no provider job id yet", async () => {
    vi.spyOn(prisma.jobLedgerEntry, "findMany").mockResolvedValue([
      {
        id: "row-pending",
        batchId: "batch-1",
        jobId: null,
        status: "PENDING",
        offlineSessionId: "sess-1",
        organization: "testcorp",
        owner: "u1",
        inputS3Uris: [],
        outputS3Uri: "",
      } as never,
    ] as never);
    const result = await withHostRequestContext(mockRequestData, async () =>
      hostCapabilities.jobLedger().list(),
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "row-pending", status: "PENDING" });
    expect(result[0].jobId).toBeUndefined();
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
      await hostCapabilities.assumeComputeRole(undefined, "othercorp");
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

  test("update throws when the session has no active organization", async () => {
    const noOrgData: HostRequestData = {
      ...mockRequestData,
      user: { ...mockRequestData.user, organization: undefined },
    };
    await expect(
      withHostRequestContext(noOrgData, async () =>
        hostCapabilities.jobLedger().update("row-1", { status: "Queued" }),
      ),
    ).rejects.toThrow("Active organization missing");
  });

  test("record throws when the session has no active organization", async () => {
    const noOrgData: HostRequestData = {
      ...mockRequestData,
      user: { ...mockRequestData.user, organization: undefined } as never,
    };
    await expect(
      withHostRequestContext(noOrgData, async () =>
        hostCapabilities.jobLedger().record({
          id: "",
          status: "PENDING",
          batchId: "batch-1",
          offlineSessionId: "s1",
          organization: "x",
          owner: "u",
          inputS3Uris: [],
          outputS3Uri: "",
          connectionId: "c1",
          roleArn: "",
          region: "",
          s3Endpoint: null,
        }),
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
    expect(() => noopHostCapabilities.brokerPublicUrl()).toThrow("server-only");
    expect(() => noopHostCapabilities.jobLedger()).toThrow("server-only");
  });
});

describe("brokerPublicUrl (SRS-CY-416101)", () => {
  // `cytarioConfig` is baked from process.env at module load, so each case
  // re-imports the module graph with the env stubbed.
  test("returns the configured BROKER_PUBLIC_URL when set", async () => {
    vi.stubEnv("BROKER_PUBLIC_URL", "https://public.example.com");
    vi.stubEnv("WEB_HOST", "https://internal.example.com");
    vi.resetModules();
    const { hostCapabilities: fresh } = await import("../hostCapabilities");
    expect(fresh.brokerPublicUrl()).toBe("https://public.example.com/api/broker");
    vi.unstubAllEnvs();
  });

  test("falls back to the browser origin when BROKER_PUBLIC_URL is unset", async () => {
    vi.stubEnv("BROKER_PUBLIC_URL", "");
    vi.stubEnv("WEB_HOST", "https://internal.example.com");
    vi.resetModules();
    const { hostCapabilities: fresh } = await import("../hostCapabilities");
    expect(fresh.brokerPublicUrl()).toBe("https://internal.example.com/api/broker");
    vi.unstubAllEnvs();
  });
});
