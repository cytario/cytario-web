import { test, expect } from "vitest";

import { HOST_API_VERSION } from "../hostApiVersion";
import { assertApiCompatible } from "@cytario/plugin-api";

// The contract this answers: a plugin that touches none of the moved API can
// declare 6, 7 and 8 at once, and a host on 8 accepts it — while a plugin that
// DOES touch the moved API must be pinned, and an old host must skip the
// spanning form only if its parser cannot read it.
test("the v8 host accepts a spanning plugin and rejects older majors", () => {
  expect(HOST_API_VERSION).toBe("8.0.0");
  const plugin = (apiVersion: string) => ({ name: "p", apiVersion });

  // Spanning: accepted (this is the whole point of the || support).
  expect(() =>
    assertApiCompatible(plugin("^6.0.0 || ^7.0.0 || ^8.0.0"), HOST_API_VERSION),
  ).not.toThrow();
  expect(() =>
    assertApiCompatible(plugin("^6.2.0 || ^7.0.0 || ^8.0.0"), HOST_API_VERSION),
  ).not.toThrow();
  // Pinned to v8: accepted.
  expect(() => assertApiCompatible(plugin("^8.0.0"), HOST_API_VERSION)).not.toThrow();
  // Pre-8 only: rejected by the v8 gate.
  expect(() => assertApiCompatible(plugin("^6.0.0"), HOST_API_VERSION)).toThrow(/host is 8\.0\.0/);
  expect(() => assertApiCompatible(plugin("^7.0.0"), HOST_API_VERSION)).toThrow();
  // Future major: rejected.
  expect(() => assertApiCompatible(plugin("^9.0.0"), HOST_API_VERSION)).toThrow();
});
