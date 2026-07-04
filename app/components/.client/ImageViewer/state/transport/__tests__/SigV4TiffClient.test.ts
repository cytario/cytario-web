import type { Credentials } from "@aws-sdk/client-sts";

import { SigV4TiffClient } from "../SigV4TiffClient";
import { createSignedFetch } from "~/utils/signedFetch";

const mockFetch = vi.fn();
global.fetch = mockFetch;

const credentials: Credentials = {
  AccessKeyId: "AKIAIOSFODNN7EXAMPLE",
  SecretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
  SessionToken: "FwoGZXIvYXdzEBYaDK",
  Expiration: new Date(),
};
const connectionConfig = "us-west-2";
const signedFetch = createSignedFetch(() => credentials, connectionConfig);

beforeEach(() => {
  mockFetch.mockReset();
});

describe("SigV4TiffClient opts.headers forwarding (SDS-CY-010050)", () => {
  test("threads constructor-supplied extraHeaders into every range request", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 206,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
      headers: new Map([["content-length", "8"]]),
    });

    const client = new SigV4TiffClient(
      "https://bucket.s3.us-west-2.amazonaws.com/img.tif",
      signedFetch,
      { "If-None-Match": "etag-xyz" },
    );

    await client.request({ headers: { Range: "bytes=0-1023" } });

    const [, fetchOptions] = mockFetch.mock.calls[0];
    expect(fetchOptions.headers).toMatchObject({
      Range: "bytes=0-1023",
      "If-None-Match": "etag-xyz",
    });
  });

  test("per-request Range wins over a Range supplied via extraHeaders", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 206,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      headers: new Map(),
    });

    const client = new SigV4TiffClient(
      "https://bucket.s3.us-west-2.amazonaws.com/img.tif",
      signedFetch,
      { Range: "bytes=0-0" },
    );

    await client.request({ headers: { Range: "bytes=1024-2047" } });

    const [, fetchOptions] = mockFetch.mock.calls[0];
    // Geotiff's per-tile Range must take precedence — extraHeaders are
    // for load-wide intent (Accept, If-None-Match, Cache-Control), not
    // for the per-fetch byte range.
    expect(fetchOptions.headers.Range).toBe("bytes=1024-2047");
  });

  test("no extraHeaders defaults to {} (no key bleed)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 206,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      headers: new Map(),
    });

    const client = new SigV4TiffClient(
      "https://bucket.s3.us-west-2.amazonaws.com/img.tif",
      signedFetch,
    );

    await client.request({ headers: { Range: "bytes=0-1023" } });

    const [, fetchOptions] = mockFetch.mock.calls[0];
    expect(fetchOptions.headers.Range).toBe("bytes=0-1023");
    expect(fetchOptions.headers["If-None-Match"]).toBeUndefined();
  });
});
