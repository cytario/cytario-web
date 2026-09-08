import { createBatchSignedFetch } from "../computeRole";

const CREDENTIALS = {
  AccessKeyId: "AKIATESTCOMPUTE000001",
  SecretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYTESTKEYCOMPUTE",
  SessionToken: "TESTSESSIONTOKENcomputeRole000012345678",
};

interface CapturedRequest {
  url: string;
  init: RequestInit;
}

describe("createBatchSignedFetch", () => {
  let captured: CapturedRequest[];
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    captured = [];
    globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      captured.push({ url: String(input), init: init ?? {} });
      return Promise.resolve(new Response(null, { status: 200 }));
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  const authorizationOf = (request: CapturedRequest): string => {
    const headers = new Headers(request.init.headers);
    const authorization = headers.get("authorization");
    expect(authorization).toBeTruthy();
    return authorization as string;
  };

  test("signs CloudWatch Logs endpoints with the logs service scope", async () => {
    const signedFetch = createBatchSignedFetch(CREDENTIALS, "eu-central-1");

    await signedFetch("https://logs.eu-central-1.amazonaws.com", {
      method: "POST",
      headers: { "content-type": "application/x-amz-json-1.1" },
      body: "{}",
    });

    expect(captured).toHaveLength(1);
    expect(captured[0].url).toBe("https://logs.eu-central-1.amazonaws.com");
    expect(authorizationOf(captured[0])).toMatch(
      /Credential=[^/]+\/\d{8}\/eu-central-1\/logs\/aws4_request/,
    );
  });

  test("signs Batch endpoints with the batch service scope", async () => {
    const signedFetch = createBatchSignedFetch(CREDENTIALS, "eu-central-1");

    await signedFetch("https://batch.eu-central-1.amazonaws.com", {
      method: "POST",
      headers: { "content-type": "application/x-amz-json-1.1" },
      body: "{}",
    });

    expect(captured).toHaveLength(1);
    expect(captured[0].url).toBe("https://batch.eu-central-1.amazonaws.com");
    expect(authorizationOf(captured[0])).toMatch(
      /Credential=[^/]+\/\d{8}\/eu-central-1\/batch\/aws4_request/,
    );
  });

  test("includes host in the signed headers set", async () => {
    const signedFetch = createBatchSignedFetch(CREDENTIALS, "eu-central-1");

    await signedFetch("https://logs.eu-central-1.amazonaws.com");

    expect(captured).toHaveLength(1);
    const headers = new Headers(captured[0].init.headers);
    expect(headers.get("host")).toBe("logs.eu-central-1.amazonaws.com");
  });
});
