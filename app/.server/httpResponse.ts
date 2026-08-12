/** A JSON error response with the `application/json` content type. */
export const jsonError = (status: number, message: string): Response =>
  Response.json({ error: message }, { status, headers: { "Content-Type": "application/json" } });
