/* global console */
/**
 * Regenerate the README coverage badge (badge.svg) from the coverage run's
 * coverage-summary.json. Run `npm run coverage` first — this script only
 * reads the result.
 *
 *   npm run coverage && node scripts/make-coverage-badge.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { makeBadge } from "badge-maker";

const summary = JSON.parse(readFileSync("coverage/coverage-summary.json", "utf8"));
const lines = summary.total.lines;
const pct = lines.pct;

const color = pct >= 80 ? "#4c1" : pct >= 60 ? "#97ca00" : pct >= 50 ? "#dfb317" : "#e05d44";

const svg = makeBadge({
  label: "tests",
  message: `${Math.round(pct)}%`,
  color,
  style: "flat",
});

writeFileSync("badge.svg", svg);
console.log(`badge.svg: tests ${Math.round(pct)}% (${lines.covered}/${lines.total})`);
