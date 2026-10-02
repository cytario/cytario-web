import { describe, expect, test, vi } from "vitest";

import { resolveResourceId } from "../../connectionsStore/selectors";
import { createDatabase } from "../createDatabase";
import { SidecarRepository } from "../sidecarRepository";

vi.mock("../createDatabase", () => ({
  createDatabase: vi.fn(),
  releaseDatabase: vi.fn(),
}));

vi.mock("../../connectionsStore/selectors", () => ({
  resolveResourceId: vi.fn(),
}));

const createDatabaseMock = vi.mocked(createDatabase);
const resolveResourceIdMock = vi.mocked(resolveResourceId);

const resourceId = "my-conn/data/slide.ome.tif";

function makeStatement(queryResult: () => unknown) {
  return {
    query: vi.fn().mockResolvedValue({ toArray: queryResult }),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

function makeConnection(prepared: ReturnType<typeof makeStatement>[]) {
  let call = 0;
  return {
    prepare: vi.fn().mockImplementation(() => {
      const statement = prepared[Math.min(call, prepared.length - 1)];
      call += 1;
      return Promise.resolve(statement);
    }),
    query: vi.fn(),
  };
}

function mockResolvedResource() {
  resolveResourceIdMock.mockReturnValue({
    connectionId: "my-conn",
    pathName: "data/slide.ome.tif",
    connectionConfig: { bucketName: "test-bucket" },
    credentials: { AccessKeyId: "key", SecretAccessKey: "secret" },
    region: "eu-central-1",
    endpoint: null,
    s3Uri: "s3://test-bucket/data/slide.ome.tif",
    httpsUrl: "https://s3.eu-central-1.amazonaws.com/test-bucket/data/slide.ome.tif",
  } as never);
}

function signedFetchFor(contents: Record<string, unknown>) {
  return vi.fn((url: string) => {
    for (const [key, value] of Object.entries(contents)) {
      if (url.includes(key)) return Promise.resolve(new Response(JSON.stringify(value)));
    }
    return Promise.reject(new Error(`unexpected url: ${url}`));
  });
}

describe("SidecarRepository.readAll", () => {
  test("reads settings sidecars through the signed fetch and keys by owner", async () => {
    mockResolvedResource();
    const globStatement = makeStatement(() => [
      { file: "s3://test-bucket/data/settings.user-a.json" },
      { file: "s3://test-bucket/data/settings.user-b.json" },
    ]);
    const connection = makeConnection([globStatement]);
    createDatabaseMock.mockResolvedValue(connection as never);
    const signedFetch = signedFetchFor({
      "settings.user-a.json": { views: [] },
      "settings.user-b.json": { views: [{ id: "v1" }] },
    });

    const result = await SidecarRepository.readAll(resourceId, "settings", signedFetch);

    expect(result).toEqual({ "user-a": { views: [] }, "user-b": { views: [{ id: "v1" }] } });
    expect(signedFetch).toHaveBeenCalledWith(
      "https://s3.eu-central-1.amazonaws.com/test-bucket/data/settings.user-a.json",
    );
    expect(signedFetch).toHaveBeenCalledWith(
      "https://s3.eu-central-1.amazonaws.com/test-bucket/data/settings.user-b.json",
    );
    expect(signedFetch).toHaveBeenCalledTimes(2);
    // Only the glob statement is prepared — settings content never passes
    // through duckdb's read_text.
    expect(connection.prepare).toHaveBeenCalledTimes(1);
    expect(connection.prepare).toHaveBeenCalledWith("SELECT file FROM glob(?)");
    expect(connection.prepare).not.toHaveBeenCalledWith("SELECT content FROM read_text(?)");
  });

  test("skips a settings file whose signed fetch fails and still loads the others", async () => {
    mockResolvedResource();
    const globStatement = makeStatement(() => [
      { file: "s3://test-bucket/data/settings.user-bad.json" },
      { file: "s3://test-bucket/data/settings.user-good.json" },
    ]);
    const connection = makeConnection([globStatement]);
    createDatabaseMock.mockResolvedValue(connection as never);
    const goodDocument = { views: [{ id: "good" }] };
    const signedFetch = vi.fn((url: string) => {
      if (url.includes("settings.user-bad.json")) {
        return Promise.reject(new Error("network failure"));
      }
      return Promise.resolve(new Response(JSON.stringify(goodDocument)));
    });

    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const result = await SidecarRepository.readAll(resourceId, "settings", signedFetch);

      expect(result).toEqual({ "user-good": goodDocument });
      const badCalls = signedFetch.mock.calls.filter(([url]) =>
        (url as string).includes("settings.user-bad.json"),
      );
      expect(badCalls).toHaveLength(1);
      expect(consoleError).toHaveBeenCalledWith(
        expect.stringContaining("settings.user-bad.json"),
        expect.anything(),
      );
    } finally {
      consoleError.mockRestore();
    }
  });

  test("reads annotations through duckdb even when a signed fetch is provided", async () => {
    mockResolvedResource();
    const globStatement = makeStatement(() => [
      { file: "s3://test-bucket/data/slide.annotations.set-a.json" },
      { file: "s3://test-bucket/data/slide.annotations.set-b.json" },
    ]);
    const readA = makeStatement(() => [{ content: JSON.stringify({ features: ["a"] }) }]);
    const readB = makeStatement(() => [{ content: JSON.stringify({ features: ["b"] }) }]);
    const connection = makeConnection([globStatement, readA, readB]);
    createDatabaseMock.mockResolvedValue(connection as never);
    const signedFetch = vi.fn();

    const result = await SidecarRepository.readAll(resourceId, "annotations", signedFetch);

    expect(result).toEqual({ "set-a": { features: ["a"] }, "set-b": { features: ["b"] } });
    expect(signedFetch).not.toHaveBeenCalled();
    expect(connection.prepare).toHaveBeenCalledWith("SELECT content FROM read_text(?)");
    expect(readA.query).toHaveBeenCalledWith("s3://test-bucket/data/slide.annotations.set-a.json");
    expect(readB.query).toHaveBeenCalledWith("s3://test-bucket/data/slide.annotations.set-b.json");
  });

  test("refuses a settings read without a signed fetch", async () => {
    mockResolvedResource();
    const connection = makeConnection([]);
    createDatabaseMock.mockResolvedValue(connection as never);

    await expect(SidecarRepository.readAll(resourceId, "settings")).rejects.toThrow(
      /require.*signed fetch|signed fetch.*require/i,
    );
    expect(connection.prepare).not.toHaveBeenCalled();
  });

  test("skips a file whose read_text fails and still loads the others", async () => {
    mockResolvedResource();
    const globStatement = makeStatement(() => [
      { file: "s3://test-bucket/data/slide.annotations.set-bad.json" },
      { file: "s3://test-bucket/data/slide.annotations.set-good.json" },
    ]);
    const badStatement = {
      query: vi.fn().mockRejectedValue(new Error("read_text failed")),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const goodStatement = makeStatement(() => [
      { content: JSON.stringify({ features: ["good"] }) },
    ]);
    const connection = makeConnection([globStatement, badStatement, goodStatement]);
    createDatabaseMock.mockResolvedValue(connection as never);

    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const result = await SidecarRepository.readAll(resourceId, "annotations");

      expect(result).toEqual({ "set-good": { features: ["good"] } });
      expect(consoleError).toHaveBeenCalledWith(
        expect.stringContaining("set-bad"),
        expect.anything(),
      );
    } finally {
      consoleError.mockRestore();
    }
  });

  test("skips a globbed file whose content is not parseable JSON", async () => {
    mockResolvedResource();
    const globStatement = makeStatement(() => [
      { file: "s3://test-bucket/data/slide.annotations.set-bad.json" },
      { file: "s3://test-bucket/data/slide.annotations.set-good.json" },
    ]);
    const badStatement = makeStatement(() => [{ content: "{not json" }]);
    const goodStatement = makeStatement(() => [
      { content: JSON.stringify({ features: ["good"] }) },
    ]);
    const connection = makeConnection([globStatement, badStatement, goodStatement]);
    createDatabaseMock.mockResolvedValue(connection as never);

    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const result = await SidecarRepository.readAll(resourceId, "annotations");

      expect(result).toEqual({ "set-good": { features: ["good"] } });
    } finally {
      consoleError.mockRestore();
    }
  });

  test("skips a globbed file whose owner cannot be parsed", async () => {
    mockResolvedResource();
    const globStatement = makeStatement(() => [
      { file: "s3://test-bucket/data/not-a-sidecar.json" },
      { file: "s3://test-bucket/data/slide.annotations.set-a.json" },
    ]);
    const readStatement = makeStatement(() => [{ content: JSON.stringify({ features: ["a"] }) }]);
    const connection = makeConnection([globStatement, readStatement]);
    createDatabaseMock.mockResolvedValue(connection as never);

    const result = await SidecarRepository.readAll(resourceId, "annotations");

    expect(result).toEqual({ "set-a": { features: ["a"] } });
    expect(readStatement.query).toHaveBeenCalledTimes(1);
    expect(readStatement.query).toHaveBeenCalledWith(
      "s3://test-bucket/data/slide.annotations.set-a.json",
    );
  });

  test("returns {} without any content reads when the glob is empty", async () => {
    mockResolvedResource();
    const globStatement = makeStatement(() => []);
    const connection = makeConnection([globStatement]);
    createDatabaseMock.mockResolvedValue(connection as never);

    const result = await SidecarRepository.readAll(resourceId, "settings", vi.fn());

    expect(result).toEqual({});
    expect(connection.prepare).toHaveBeenCalledTimes(1);
    expect(connection.prepare).toHaveBeenCalledWith("SELECT file FROM glob(?)");
  });
});
