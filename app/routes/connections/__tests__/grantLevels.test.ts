import { describe, expect, test } from "vitest";

import { grantLevelHint, levelsForGrant } from "../grantLevels";
import mock from "~/utils/__tests__/__mocks__";
import { toClientCatalog } from "~/utils/providerCatalog.schema";

const catalog = toClientCatalog(
  mock.providerCatalog({
    providerConnections: [
      mock.providerConnection({ id: "pc-1" }),
      mock.providerConnection({ id: "pc-2" }),
    ],
    providerRoles: [
      mock.providerRole({
        providerConnectionId: "pc-1",
        allowedScopes: ["lab"],
        accessLevel: "read-only",
      }),
      mock.providerRole({
        providerConnectionId: "pc-1",
        allowedScopes: ["lab", "ops"],
        accessLevel: "annotate",
      }),
      mock.providerRole({
        providerConnectionId: "pc-1",
        allowedScopes: [],
        accessLevel: "read-write",
      }),
      mock.providerRole({
        providerConnectionId: "pc-2",
        allowedScopes: ["lab"],
        accessLevel: "admin",
      }),
    ],
  }),
);

describe("levelsForGrant", () => {
  test("offers only the levels whose role's allowed scopes cover the grant scope", () => {
    expect(levelsForGrant(catalog, "pc-1", "lab/team-a")).toEqual([
      "read-only",
      "annotate",
      "read-write",
    ]);
    expect(levelsForGrant(catalog, "pc-1", "ops/team-b")).toEqual(["annotate", "read-write"]);
    expect(levelsForGrant(catalog, "pc-1", "uncovered")).toEqual(["read-write"]);
  });

  test("offers levels for an org-root grant without requiring scope coverage", () => {
    expect(levelsForGrant(catalog, "pc-1", "*")).toEqual(["read-only", "annotate", "read-write"]);
  });

  test("offers levels for an unselected scope without requiring coverage", () => {
    expect(levelsForGrant(catalog, "pc-1", "")).toEqual(["read-only", "annotate", "read-write"]);
  });

  test("an org-wide role (empty allowedScopes) covers any scope", () => {
    const orgWide = toClientCatalog(
      mock.providerCatalog({
        providerConnections: [mock.providerConnection({ id: "pc-1" })],
        providerRoles: [mock.providerRole({ providerConnectionId: "pc-1", allowedScopes: [] })],
      }),
    );
    expect(levelsForGrant(orgWide, "pc-1", "any/group")).toEqual(["read-only"]);
  });

  test("excludes roles of other provider connections", () => {
    expect(levelsForGrant(catalog, "pc-1", "lab")).not.toContain("admin");
    expect(levelsForGrant(catalog, "pc-2", "lab")).toEqual(["admin"]);
  });

  test("filters roles to the bucket row when one is known", () => {
    const bucketed = toClientCatalog(
      mock.providerCatalog({
        providerConnections: [mock.providerConnection({ id: "pc-1" })],
        providerRoles: [
          mock.providerRole({
            providerConnectionId: "pc-1",
            allowedScopes: ["lab"],
            accessLevel: "read-only",
            bucketIds: ["bucket-1"],
          }),
          mock.providerRole({
            providerConnectionId: "pc-1",
            allowedScopes: ["lab"],
            accessLevel: "annotate",
            bucketIds: ["bucket-2"],
          }),
        ],
      }),
    );
    expect(levelsForGrant(bucketed, "pc-1", "lab", "bucket-1")).toEqual(["read-only"]);
    expect(levelsForGrant(bucketed, "pc-1", "lab", "bucket-2")).toEqual(["annotate"]);
    expect(levelsForGrant(bucketed, "pc-1", "lab", "bucket-other")).toEqual([]);
    expect(levelsForGrant(bucketed, "pc-1", "lab")).toEqual(["read-only", "annotate"]);
  });

  test("returns no levels without a catalog", () => {
    expect(levelsForGrant(undefined, "pc-1", "lab")).toEqual([]);
  });
});

describe("grantLevelHint", () => {
  const namedOnly = toClientCatalog(
    mock.providerCatalog({
      providerConnections: [mock.providerConnection({ id: "pc-1" })],
      providerRoles: [
        mock.providerRole({
          providerConnectionId: "pc-1",
          allowedScopes: ["lab"],
          accessLevel: "read-only",
        }),
      ],
    }),
  );
  const available = { catalog, loading: false };

  test("explains a grant scope no role covers", () => {
    expect(grantLevelHint({ catalog: namedOnly, loading: false }, "pc-1", "uncovered")).toMatch(
      /does not allow access/i,
    );
  });

  test("explains a grant scope no role on the bucket covers", () => {
    const bucketed = toClientCatalog(
      mock.providerCatalog({
        providerConnections: [mock.providerConnection({ id: "pc-1" })],
        providerRoles: [
          mock.providerRole({
            providerConnectionId: "pc-1",
            allowedScopes: ["lab"],
            bucketIds: ["bucket-2"],
          }),
        ],
      }),
    );
    expect(
      grantLevelHint({ catalog: bucketed, loading: false }, "pc-1", "lab", "bucket-1"),
    ).toMatch(/does not allow access/i);
  });

  test("is undefined when a level can be picked", () => {
    expect(grantLevelHint(available, "pc-1", "lab/team-a")).toBeUndefined();
    expect(grantLevelHint(available, "pc-1", "*")).toBeUndefined();
    expect(grantLevelHint(available, "pc-1", "")).toBeUndefined();
  });

  test("explains a loading catalog, even for an unselected scope", () => {
    expect(grantLevelHint({ loading: true }, "pc-1", "")).toMatch(/loading/i);
  });

  test("explains a loading catalog", () => {
    expect(grantLevelHint({ loading: true }, "pc-1", "lab/team-a")).toMatch(/loading/i);
  });
  test("explains an unavailable catalog", () => {
    expect(grantLevelHint({ loading: false, error: "catalog down" }, "pc-1", "lab")).toMatch(
      /unavailable/i,
    );
  });
});
