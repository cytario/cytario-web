import { PILLARS, PILLAR_IDS } from "../pillars";

describe("PILLARS registry", () => {
  test("covers exactly PILLAR_IDS", () => {
    expect(Object.keys(PILLARS).sort()).toEqual([...PILLAR_IDS].sort());
  });

  test("every pillar has a non-empty title and an icon", () => {
    for (const id of PILLAR_IDS) {
      const pillar = PILLARS[id];
      expect(pillar.id).toBe(id);
      expect(pillar.title).not.toBe("");
      expect(pillar.icon).not.toBe("");
    }
  });
});
