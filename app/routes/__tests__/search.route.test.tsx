import { describe, expect, test } from "vitest";

import { loader, handle } from "~/routes/search.route";

describe("SearchRoute", () => {
  test("loader extracts query from the URL", () => {
    const request = new Request("http://localhost/search?query=patient-x");
    const result = loader({
      request,
      params: {},
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    expect(result).toEqual({ searchQuery: "patient-x" });
  });

  test("loader defaults missing query to empty string", () => {
    const request = new Request("http://localhost/search");
    const result = loader({
      request,
      params: {},
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    expect(result).toEqual({ searchQuery: "" });
  });

  test("handle returns the search breadcrumb", () => {
    expect(handle.breadcrumb()).toEqual({ label: "Search", to: "/search" });
  });

  test("loader scopes each connection's listing to its own prefix and produces sibling top-level nodes when connections share a bucket", async () => {
    vi.mocked(getS3Client).mockResolvedValue({} as S3Client);

    const demoConfig = mock.connectionConfig({
      name: "Repository Demo Deliverables",
      bucketName: "shared-bucket",
      prefix: "Repository Demo Deliverables/",
    });
    const slashmConfig = mock.connectionConfig({
      name: "Repository Slash-m Exchange",
      bucketName: "shared-bucket",
      prefix: "Repository Slash-m Exchange/",
    });

    vi.mocked(getObjects).mockImplementation(
      async (_config, _client, _query, prefix) => {
        if (prefix === "Repository Demo Deliverables/") {
          return [
            {
              Key: "Repository Demo Deliverables/results/demo.parquet",
            },
          ];
        }
        if (prefix === "Repository Slash-m Exchange/") {
          return [
            {
              Key: "Repository Slash-m Exchange/results/USL-2022-42307-42.ome.tif/results/results_total.csv.parquet",
            },
          ];
        }
        return [];
      },
    );

    const request = new Request("http://localhost/search?query=parquet");
    const mockContext = {
      get: vi.fn((ctx) => {
        if (ctx === authContext) {
          return {
            user: mock.user(),
            authTokens: {
              idToken: mock.idToken(),
              accessToken: "mock-access-token",
              refreshToken: "mock-refresh-token",
            },
            credentials: {
              [demoConfig.name]: mock.credentials(),
              [slashmConfig.name]: mock.credentials(),
            },
            connectionConfigs: [demoConfig, slashmConfig],
          };
        }
        return undefined;
      }),
    };

    const result = await loader({
      request,
      params: {},
      context: mockContext as never,
      unstable_pattern: "",
      unstable_url: new URL(request.url),
    });

    // Each connection should have been listed scoped to its own prefix.
    expect(getObjects).toHaveBeenCalledWith(
      demoConfig,
      expect.anything(),
      "parquet",
      "Repository Demo Deliverables/",
    );
    expect(getObjects).toHaveBeenCalledWith(
      slashmConfig,
      expect.anything(),
      "parquet",
      "Repository Slash-m Exchange/",
    );

    // Top-level nodes are siblings — one per connection, neither nested in the other.
    expect(result.nodes).toHaveLength(2);
    expect(result.nodes.map((n) => n.name)).toEqual([
      "Repository Demo Deliverables",
      "Repository Slash-m Exchange",
    ]);

    // Demo's tree must NOT contain the other connection's prefix as a directory.
    const demoChildNames = result.nodes[0].children.map((c) => c.name);
    expect(demoChildNames).not.toContain("Repository Slash-m Exchange");
    expect(demoChildNames).toContain("results");

    // Slash-m's first file path should be cleanly relative to its own prefix.
    const slashmTree = result.nodes[1];
    expect(slashmTree.children[0].name).toBe("results");
    expect(slashmTree.children[0].children[0].name).toBe(
      "USL-2022-42307-42.ome.tif",
    );
    expect(slashmTree.children[0].children[0].pathName).toBe(
      "results/USL-2022-42307-42.ome.tif/",
    );
  });
});
