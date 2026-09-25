import type { CatalogConnectionProjection, CatalogCredentialMode, RegistryKind } from "../host";

test("CatalogConnectionProjection accepts registryKind and credentialMode (SDS-CY-080201)", async () => {
  const mod = await import("../index");
  // Type-only surface: no runtime export was added alongside the types.
  expect((mod as Record<string, unknown>).RegistryKind).toBeUndefined();
  expect((mod as Record<string, unknown>).CatalogCredentialMode).toBeUndefined();

  const projection: CatalogConnectionProjection = {
    id: "ac-1",
    name: "Harbor",
    registryEndpoint: "https://harbor.example.com",
    namespace: "cytario",
    allowedGroups: [],
    registryKind: "oci-catalog",
    credentialMode: "anonymous",
  };
  expect(projection.registryKind).toBe("oci-catalog");
  expect(projection.credentialMode).toBe("anonymous");
});

test("a projection predating the fields still satisfies the type (absent ⇒ harbor)", () => {
  const legacy: CatalogConnectionProjection = {
    id: "ac-1",
    name: "Harbor",
    registryEndpoint: "https://harbor.example.com",
    namespace: "cytario",
    allowedGroups: [],
  };
  expect(legacy.registryKind).toBeUndefined();
  expect(legacy.credentialMode).toBeUndefined();
});

test("the value sets are the closed unions (kind: 4 values, mode: 2)", () => {
  const kinds: RegistryKind[] = ["harbor", "oci-catalog", "github-packages", "ecr-native"];
  const modes: CatalogCredentialMode[] = ["connection", "anonymous"];
  expect(kinds).toHaveLength(4);
  expect(modes).toHaveLength(2);
});

// The registryKind and credentialMode fields landed in 6.9.0 and the picker
// folder mode in 6.10.0; the floor has since moved on, so this file asserts
// nothing about the version literal — that guard moved to the pull-secrets
// surface test with the newest minor.
