import { test, expect } from "vitest";

import { HOST_API_VERSION } from "../hostApiVersion";
import { assertApiCompatible } from "@cytario/plugin-api";

// The contract this answers: a plugin that touches none of the moved API can
// declare 6, 7 and 8 at once, and a host on 8 accepts it — while a plugin that
// DOES touch the moved API must be pinned, and an old host must skip the
// spanning form only if its parser cannot read it.
test("the v9 host accepts a spanning plugin and rejects older majors", () => {
  expect(HOST_API_VERSION).toBe("9.3.0");
  const plugin = (apiVersion: string) => ({ name: "p", apiVersion });

  // Spanning: accepted (this is the whole point of the || support).
  expect(() =>
    assertApiCompatible(plugin("^6.0.0 || ^7.0.0 || ^8.0.0 || ^9.0.0"), HOST_API_VERSION),
  ).not.toThrow();
  expect(() =>
    assertApiCompatible(plugin("^6.2.0 || ^7.0.0 || ^8.0.0"), HOST_API_VERSION),
  ).toThrow();
  // Pinned to v9: accepted.
  expect(() => assertApiCompatible(plugin("^9.0.0"), HOST_API_VERSION)).not.toThrow();
  expect(() => assertApiCompatible(plugin("^9.3.0"), HOST_API_VERSION)).not.toThrow();
  // Pre-9 only: rejected by the v9 gate.
  expect(() => assertApiCompatible(plugin("^6.0.0"), HOST_API_VERSION)).toThrow(
    new RegExp(`host is ${HOST_API_VERSION.replace(".", "\\.")}`),
  );
  expect(() => assertApiCompatible(plugin("^7.0.0"), HOST_API_VERSION)).toThrow();
  expect(() => assertApiCompatible(plugin("^8.0.0"), HOST_API_VERSION)).toThrow();
  // Future major: rejected.
  expect(() => assertApiCompatible(plugin("^10.0.0"), HOST_API_VERSION)).toThrow();
});

// 9.2.0 → 9.3.0 is additive, so a plugin pinned to a 9.3 feature still installs
// alongside hosts that predate it: the range is minor-flexible, not exact.
test("the 9.3 widening stays installable for a ^9.0.0 consumer", () => {
  expect(() =>
    assertApiCompatible({ name: "consumer", apiVersion: "^9.0.0" }, "9.3.0"),
  ).not.toThrow();
  expect(() =>
    assertApiCompatible({ name: "consumer", apiVersion: "^9.3.0" }, "9.3.0"),
  ).not.toThrow();
  // A host that never shipped the widening cannot satisfy a 9.3 requirement.
  expect(() => assertApiCompatible({ name: "consumer", apiVersion: "^9.3.0" }, "9.2.0")).toThrow();
});
