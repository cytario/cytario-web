import { type MiddlewareFunction } from "react-router";

import { createLabel } from "~/.server/logging";

const label = createLabel("duration", "red");

/**
 * Middleware that logs request duration for debugging performance.
 * Export this from routes where you want to measure request timing.
 */
export const requestDurationMiddleware: MiddlewareFunction = async (
  { request },
  next
) => {
  const startTime = performance.now();
  const url = new URL(request.url);
  const path = url.pathname + url.search;

  try {
    const response = await next();
    const duration = (performance.now() - startTime).toFixed(2);
    console.info(`${label} ${request.method} ${path} - ${duration}ms`);
    return response;
  } catch (error) {
    const duration = (performance.now() - startTime).toFixed(2);
    console.error(`${label} ${request.method} ${path} - ${duration}ms (error)`);
    throw error;
  }
};
