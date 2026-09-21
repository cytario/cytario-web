import { beforeEach, describe, expect, test, vi } from "vitest";

import { resolveJobBinding } from "../resolveJobBinding";
import { prisma } from "~/.server/db/prisma";

const ROW = {
  id: "row-1",
  roleArn: "arn:aws:iam::123:role/storage",
  region: "eu-central-1",
  inputS3Uris: ["s3://bucket/in/"],
  outputS3Uri: "s3://bucket/out/",
  s3Endpoint: null,
  batchId: "batch-1",
  jobId: "job-1",
  offlineSessionId: "sess-1",
  organization: "testcorp",
  owner: "submitting-user-42",
};

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(prisma.jobLedgerEntry, "findUnique").mockResolvedValue(ROW as never);
});

describe("resolveJobBinding (SRS-CY-416110, SDS-CY-080403)", () => {
  test("looks the row up by the sha256 of the presented token, and by nothing else", async () => {
    await resolveJobBinding("a-job-session-token");

    expect(prisma.jobLedgerEntry.findUnique).toHaveBeenCalledTimes(1);
    const query = vi.mocked(prisma.jobLedgerEntry.findUnique).mock.calls[0]?.[0];
    expect(query).toEqual({
      where: { jobTokenHash: expect.stringMatching(/^[0-9a-f]{64}$/) },
    });
  });

  test("the hash in the query is the hash of the token, not the token itself", async () => {
    const { createHash } = await import("node:crypto");
    const expected = createHash("sha256").update("a-job-session-token").digest("hex");

    await resolveJobBinding("a-job-session-token");

    const query = vi.mocked(prisma.jobLedgerEntry.findUnique).mock.calls[0]?.[0];
    expect(query.where.jobTokenHash).toBe(expected);
    expect(query.where.jobTokenHash).not.toBe("a-job-session-token");
  });

  test("no job identifier, owner, or organization reaches the query", async () => {
    await resolveJobBinding("a-job-session-token");

    const query = vi.mocked(prisma.jobLedgerEntry.findUnique).mock.calls[0]?.[0];
    // A caller that presented job B's id gets nothing: there is no predicate
    // by which a token could name a row other than the one it hashes to.
    expect(Object.keys(query.where)).toEqual(["jobTokenHash"]);
  });

  test("returns the row's binding, including the organization the mint is scoped to", async () => {
    const binding = await resolveJobBinding("a-job-session-token");

    expect(binding).toMatchObject({
      jobId: "job-1",
      batchId: "batch-1",
      offlineSessionId: "sess-1",
      organization: "testcorp",
      owner: "submitting-user-42",
    });
  });

  test("carries the ledger row, so the broker mints without re-reading it", async () => {
    const binding = await resolveJobBinding("a-job-session-token");

    // The scope, role and targets all come from this row.
    expect(binding?.row).toBeDefined();
    expect(binding?.row.jobId).toBe("job-1");
  });

  test("a token with no matching row resolves to nothing", async () => {
    vi.mocked(prisma.jobLedgerEntry.findUnique).mockResolvedValue(null as never);

    await expect(resolveJobBinding("an-unissued-token")).resolves.toBeNull();
  });

  test("the row's batch is the key the broker reads its credential by", async () => {
    // The relation, not a matched session id: the broker mints for the batch
    // the row points at.
    const binding = await resolveJobBinding("a-job-session-token");

    expect(binding?.batchId).toBe("batch-1");
  });
});
