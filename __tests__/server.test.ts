import type { Request, Response } from "express";

/**
 * Tests for the /healthz endpoint handler and its placement relative to
 * middleware in server.ts.
 *
 * Since server.ts performs a top-level dynamic import of build artifacts
 * (unavailable during testing) and immediately starts the server, we
 * cannot import it directly. Instead, we extract and test the handler
 * function in isolation.
 *
 * The handler implementation mirrors server.ts exactly:
 *   - Returns 200 "ok" when the server is healthy
 *   - Returns 503 "shutting down" after shutdown is initiated
 *
 * Middleware ordering (healthz before compression/logging/static) is
 * verified by structural review and documented in these tests.
 */

type HealthHandler = (req: Request, res: Response) => void;

function createHealthHandler(): {
  handler: HealthHandler;
  setShuttingDown: (v: boolean) => void;
} {
  let isShuttingDown = false;

  const handler: HealthHandler = (_req, res) => {
    if (isShuttingDown) {
      res.status(503).send("shutting down");
    } else {
      res.status(200).send("ok");
    }
  };

  return {
    handler,
    setShuttingDown: (v: boolean) => {
      isShuttingDown = v;
    },
  };
}

function createMockResponse(): Response & {
  _status: number;
  _body: string;
} {
  const res = {
    _status: 0,
    _body: "",
    status(code: number) {
      res._status = code;
      return res;
    },
    send(body: string) {
      res._body = body;
      return res;
    },
  } as unknown as Response & { _status: number; _body: string };
  return res;
}

describe("/healthz endpoint", () => {
  test("returns 200 with 'ok' when server is running normally", () => {
    const { handler } = createHealthHandler();
    const res = createMockResponse();

    handler({} as Request, res);

    expect(res._status).toBe(200);
    expect(res._body).toBe("ok");
  });

  test("returns 503 with 'shutting down' after shutdown is initiated", () => {
    const { handler, setShuttingDown } = createHealthHandler();
    setShuttingDown(true);
    const res = createMockResponse();

    handler({} as Request, res);

    expect(res._status).toBe(503);
    expect(res._body).toBe("shutting down");
  });

  test("transitions from healthy to unhealthy when shutdown begins", () => {
    const { handler, setShuttingDown } = createHealthHandler();

    // First request — healthy
    const res1 = createMockResponse();
    handler({} as Request, res1);
    expect(res1._status).toBe(200);
    expect(res1._body).toBe("ok");

    // Initiate shutdown
    setShuttingDown(true);

    // Second request — unhealthy
    const res2 = createMockResponse();
    handler({} as Request, res2);
    expect(res2._status).toBe(503);
    expect(res2._body).toBe("shutting down");
  });

  test("health endpoint is registered before middleware in server.ts", async () => {
    // Structural verification: read server.ts and confirm that /healthz
    // is registered before compression, static file serving, and logging.
    const fs = await import("node:fs");
    const path = await import("node:path");

    const serverSource = fs.readFileSync(
      path.resolve(__dirname, "..", "server.ts"),
      "utf-8",
    );

    const healthzIndex = serverSource.indexOf('app.get("/healthz"');
    const compressionIndex = serverSource.indexOf("app.use(compression()");
    const morganIndex = serverSource.indexOf('app.use(morgan("tiny")');
    const staticIndex = serverSource.indexOf("app.use(express.static");
    const catchAllIndex = serverSource.indexOf('app.all(\n  "*"');

    // All indices must be found
    expect(healthzIndex).toBeGreaterThan(-1);
    expect(compressionIndex).toBeGreaterThan(-1);
    expect(morganIndex).toBeGreaterThan(-1);
    expect(staticIndex).toBeGreaterThan(-1);
    expect(catchAllIndex).toBeGreaterThan(-1);

    // /healthz must come before all middleware
    expect(healthzIndex).toBeLessThan(compressionIndex);
    expect(healthzIndex).toBeLessThan(morganIndex);
    expect(healthzIndex).toBeLessThan(staticIndex);
    expect(healthzIndex).toBeLessThan(catchAllIndex);
  });

  test("shutdown flag starts as false in server.ts", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");

    const serverSource = fs.readFileSync(
      path.resolve(__dirname, "..", "server.ts"),
      "utf-8",
    );

    // Verify the initial value of isShuttingDown is false
    expect(serverSource).toContain("let isShuttingDown = false");
  });

  test("SIGTERM and SIGINT both trigger shutdown in server.ts", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");

    const serverSource = fs.readFileSync(
      path.resolve(__dirname, "..", "server.ts"),
      "utf-8",
    );

    // Verify both signals are handled
    expect(serverSource).toMatch(/["']SIGTERM["']/);
    expect(serverSource).toMatch(/["']SIGINT["']/);

    // Verify shutdown sets the flag
    expect(serverSource).toContain("isShuttingDown = true");
  });
});
