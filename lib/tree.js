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
// called. A folder that is no checkout is walked, passing the folders nobody writes by hand, and a git
// checkout inside it is read as its tracked files. A worktree, a submodule or a shared workspace is
// passed wherever it sits, since its files are another checkout's. In both, a vendored dependency or
// a build output that was committed anyway is passed by name, since reading it tells a reviewer
// nothing about this repository.
"use strict";

const { execFileSync } = require("node:child_process");
const { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { dirname, join, resolve, sep } = require("node:path");

// Each version control system's own folder or file, whose presence makes a folder a checkout of it.
const MARKS = [
  [".git", "git"], [".hg", "Mercurial"], [".svn", "Subversion"], [".jj", "Jujutsu"], [".sl", "Sapling"],
  [".bzr", "Bazaar"], ["_darcs", "Darcs"], [".fslckout", "Fossil"], ["_FOSSIL_", "Fossil"],
];

const SKIP = new Set([
  ...MARKS.map(([name]) => name), "node_modules", "vendor", "target", "dist", "build", "out", ".next",
  ".nuxt", "__pycache__", ".venv", "venv", ".tox", "coverage", ".cache", ".terraform", "Pods",
]);

// A folder skipped for its name, or for starting like a virtual environment, as .venv-model does.
const skipped = (name) => SKIP.has(name) || name.startsWith(".venv");

const kindAt = (path) => {
  try {
    const held = lstatSync(path);
    return held.isDirectory() ? "folder" : held.isFile() ? "file" : null;
  } catch (thrown) {
    if (thrown.code === "ENOENT" || thrown.code === "ENOTDIR") return null;
    throw thrown;
  }
};

/**
 * What version control makes a folder a checkout, or null. Linked is a git worktree or submodule, a
 * Jujutsu workspace or a Mercurial share: its history lives in another checkout, so its files are a
 * second copy of that checkout's. Bare is a repository with no files checked out.
 */
function checkoutKind(dir) {
  if (kindAt(join(dir, ".git")) === "file") return { vcs: "git", linked: true };
  if (kindAt(join(dir, ".git")) === "folder") return { vcs: "git" };
  if (kindAt(join(dir, ".jj", "repo")) === "file") return { vcs: "Jujutsu", linked: true };
  if (kindAt(join(dir, ".hg", "sharedpath")) === "file") return { vcs: "Mercurial", linked: true };
  for (const [name, vcs] of MARKS.slice(1)) {
    if (existsSync(join(dir, name))) return { vcs };
  }
  if (kindAt(join(dir, "HEAD")) === "file" && kindAt(join(dir, "objects")) === "folder" &&
    kindAt(join(dir, "refs")) === "folder") return { vcs: "git", bare: true };
  return null;
}

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
    // empty-catch:allow: a folder that will not list has nothing the reading could read either.
    return held;
  }
  for (const entry of entries) {
    if (skipped(entry.name)) continue;
    const path = at ? `${at}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      const kind = checkoutKind(join(root, path));
      if (kind?.linked || kind?.bare) continue;
      const own = kind?.vcs === "git" ? tracked(join(root, path)) : null;
      if (own) held.push(...own.map((one) => `${path}/${one}`));
      else walked(root, path, held);
    } else if (entry.isFile()) held.push(path);
  }
  return held;
}

// The name a repository goes by, from where it was cloned, so two clones of one project group. A
// clone with no origin groups by its first commit.
function originOf(dir) {
  const quietly = (args) => {
    try {
      return execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    } catch {
      // empty-catch:allow: git exits non-zero where there is no origin, no commit or no branch, and
      // each is an answer of none.
      return "";
    }
  };
  const url = quietly(["remote", "get-url", "origin"]);
  const named = url.replace(/\.git$/, "").split(/[/:]/).filter(Boolean).slice(-2).join("/");
  return {
    key: named || quietly(["rev-list", "--max-parents=0", "HEAD"]).split("\n")[0] || dir,
    name: named || null,
    branch: quietly(["symbolic-ref", "--short", "--quiet", "HEAD"]) || null,
  };
}

function listed(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true });
  } catch {
    // empty-catch:allow: a folder this cannot list is one the reading cannot read either, so it
    // holds nothing to ask about.
    return [];
  }
}

/**
 * The repositories a folder holds, where the folder is no checkout itself: each checkout below it,
 * grouped with the other clones of the same project, and each folder that is a copy of one without
 * its version control, recognised by holding most of what that checkout tracks at its top. Null where
 * the folder is a checkout. Worktrees and bare repositories are left out, as the reading leaves them.
 */
function checkoutsIn(root, depth = 3) {
  const at = resolve(root);
  if (tracked(at) !== null || checkoutKind(at)) return null;
  const found = [];
  const loose = [];
  const visit = (path, level) => {
    for (const entry of listed(join(at, path))) {
      if (!entry.isDirectory() || skipped(entry.name)) continue;
      const inner = path ? `${path}/${entry.name}` : entry.name;
      const kind = checkoutKind(join(at, inner));
      if (kind) {
        if (!kind.linked && !kind.bare) found.push({ path: inner, vcs: kind.vcs });
        continue;
      }
      loose.push(inner);
      if (level < depth) visit(inner, level + 1);
    }
  };
  visit("", 1);

  const groups = new Map();
  const tops = [];
  for (const one of found) {
    const origin = one.vcs === "git" ? originOf(join(at, one.path)) : { key: one.path, name: null, branch: null };
    if (!groups.has(origin.key)) groups.set(origin.key, { repository: origin.name ?? one.path, places: [] });
    groups.get(origin.key).places.push({ path: one.path, vcs: one.vcs, branch: origin.branch });
    const files = one.vcs === "git" ? tracked(join(at, one.path)) : null;
    if (files) tops.push({ key: origin.key, path: one.path, top: new Set(files.map((file) => file.split("/")[0])) });
  }
  const copies = [];
  for (const path of loose) {
    if (copies.some((one) => path.startsWith(`${one}/`))) continue;
    const names = new Set(listed(join(at, path)).map((entry) => entry.name));
    const match = tops.find((one) => one.top.size >= 3 &&
      [...one.top].filter((name) => names.has(name)).length >= 0.8 * one.top.size);
    if (!match) continue;
    copies.push(path);
    groups.get(match.key).places.push({ path, vcs: null, branch: null, copy_of: match.path });
  }
  return [...groups.values()];
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

module.exports = { SKIP, checkoutsIn, copied, filesOf, skipped };
