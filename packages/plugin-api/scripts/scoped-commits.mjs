import { execFile } from "node:child_process";
import { promisify } from "node:util";

import * as commitAnalyzer from "@semantic-release/commit-analyzer";
import * as releaseNotesGenerator from "@semantic-release/release-notes-generator";

const execFileAsync = promisify(execFile);

// `:/` anchors the pathspec to the repo root, so it resolves correctly even
// though the release runs with cwd set to the package directory.
const PACKAGE_PATH = ":/packages/plugin-api/";

// semantic-release commit objects carry no changed-file list, so the set of
// hashes that touched the package is resolved once via git and reused across
// both lifecycle steps in a release run.
let touchingHashes;

function hashesTouchingPackage(cwd) {
  if (!touchingHashes) {
    touchingHashes = execFileAsync("git", ["log", "--format=%H", "--", PACKAGE_PATH], {
      cwd,
      maxBuffer: 64 * 1024 * 1024,
    }).then(({ stdout }) => new Set(stdout.split("\n").filter(Boolean)));
  }
  return touchingHashes;
}

// semantic-release feeds every commit since the last package tag to the
// analyzer. Without this filter a repo-wide `feat!:` bumps an untouched
// package; intersect the range with commits that actually changed the package.
async function scopeCommits(context) {
  const touching = await hashesTouchingPackage(context.cwd);
  return context.commits.filter((commit) => touching.has(commit.hash));
}

export async function analyzeCommits(pluginConfig, context) {
  const commits = await scopeCommits(context);
  return commitAnalyzer.analyzeCommits(pluginConfig, { ...context, commits });
}

export async function generateNotes(pluginConfig, context) {
  const commits = await scopeCommits(context);
  return releaseNotesGenerator.generateNotes(pluginConfig, { ...context, commits });
}
