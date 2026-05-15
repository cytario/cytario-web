test("package surface is importable", async () => {
  const mod = await import("../index");
  expect(mod).toBeDefined();
});
