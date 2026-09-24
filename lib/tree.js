// tree - which files are the repository.
//
// The reading, the scanners and the inventory each listed the tree for themselves and disagreed. The
// reading skipped dependency and build folders by name, the scanners were handed the whole directory,
// and a customer run counted one advisory 34 times: once for the repository and once for each of 33
// editor worktrees checked out inside it, with a Python environment's test fixtures on top. So the
// three ask here.
//
// A git checkout is the files git tracks, as they stand on disk. That is what somebody committed, so
// a worktree, a virtual environment, a build and a download nobody added drop out whatever they are
// called. A folder that is no checkout is walked, passing the folders nobody writes by hand. In both,
// a vendored dependency or a build output that was committed anyway is passed by name, since reading
// it tells a reviewer nothing about this repository.
"use strict";

const { execFileSync } = require("node:child_process");
const { copyFileSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { dirname, join, resolve, sep } = require("node:path");

const SKIP = new Set([
  ".git", "node_modules", "vendor", "target", "dist", "build", "out", ".next", ".nuxt",
  "__pycache__", ".venv", "venv", ".tox", "coverage", ".cache", ".terraform", "Pods", ".claude",
]);

// A folder skipped for its name, or for starting like a virtual environment, as .venv-model does.
const skipped = (name) => SKIP.has(name) || name.startsWith(".venv");

/** The files git tracks, relative to the root, or null where the root is no git checkout. */
function tracked(root) {
  try {
    const listed = execFileSync("git", ["ls-files", "-z", "--cached"], {
      cwd: root, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"],
    });
    return listed.split("\0").filter(Boolean);
  } catch {
    return null;
  }
}

function walked(root, at = "", held = []) {
  let entries;
  try {
    entries = readdirSync(join(root, at), { withFileTypes: true });
  } catch {
    return held;
  }
  for (const entry of entries) {
    if (skipped(entry.name)) continue;
    const path = at ? `${at}/${entry.name}` : entry.name;
    if (entry.isDirectory()) walked(root, path, held);
    else if (entry.isFile()) held.push(path);
  }
  return held;
}

/**
 * Every file of the repository, as absolute paths. A tracked path that is a link, a submodule or
 * gone from the disk is left out, since there is nothing of this repository's own to read there.
 */
function filesOf(root) {
  const at = resolve(root);
  const listed = tracked(at) ?? walked(at);
  const out = [];
  for (const path of listed) {
    if (path.split("/").some(skipped)) continue;
    const full = join(at, path);
    try {
      if (lstatSync(full).isFile()) out.push(full);
    } catch {
      // Tracked and deleted on disk: the tree as it stands no longer holds it.
    }
  }
  return out;
}

/**
 * A copy of the repository's files in a folder of their own, for a tool that reads a directory and
 * cannot be told which files are the repository. Paths inside it match the repository's, so what
 * the tool reports reads as a place in the repository. The caller removes it with done().
 */
function copied(root) {
  const at = resolve(root);
  const into = mkdtempSync(join(tmpdir(), "evalation-tree-"));
  for (const full of filesOf(at)) {
    const to = join(into, full.slice(at.length + sep.length));
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(full, to);
  }
  return { path: into, done: () => rmSync(into, { recursive: true, force: true }) };
}

module.exports = { SKIP, copied, filesOf, skipped };
