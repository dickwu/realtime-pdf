#!/usr/bin/env bun
/**
 * bump-version.mjs — bump the Realtime PDF version across every manifest that tracks it.
 *
 * `src-tauri/tauri.conf.json` is the source of truth for the *released* version: tauri-action
 * reads it for the `__VERSION__` substitution and the GitHub release name, so the pushed tag
 * (`vX.Y.Z`) MUST match it. We read the current version from there and keep the other files in
 * lockstep so the 3-way drift that crept in historically (package.json lagged at 0.1.13 while
 * the app shipped 0.1.14) can't happen again.
 *
 * Files touched (mirrors the historical `chore(release)` commit, plus package.json):
 *   - src-tauri/tauri.conf.json   "version": "..."        (source of truth — required)
 *   - src-tauri/Cargo.toml        [package] version = ... (Rust crate version — required)
 *   - src-tauri/Cargo.lock        realtime-pdf entry      (one-line mirror of Cargo.toml)
 *   - package.json                "version": "..."        (cosmetic; private pkg, unused by Tauri)
 *
 * Run from the repo root:
 *   bun .claude/skills/cut-release/scripts/bump-version.mjs <new-version>
 *   bun .claude/skills/cut-release/scripts/bump-version.mjs patch   # 0.1.14 -> 0.1.15
 *   bun .claude/skills/cut-release/scripts/bump-version.mjs minor   # 0.1.14 -> 0.2.0
 *   bun .claude/skills/cut-release/scripts/bump-version.mjs major   # 0.1.14 -> 1.0.0
 *
 * Prints the resolved version as the last line (e.g. `0.1.15`) so the caller can capture it.
 */
import { readFileSync, writeFileSync } from "node:fs";

const TAURI = "src-tauri/tauri.conf.json";
const CARGO_TOML = "src-tauri/Cargo.toml";
const CARGO_LOCK = "src-tauri/Cargo.lock";
const PKG = "package.json";
const SEMVER = /^\d+\.\d+\.\d+$/;

const arg = process.argv[2];
if (!arg)
  fail(
    "missing argument — pass a semver like 0.1.15, or one of: patch | minor | major",
  );

const current = JSON.parse(read(TAURI)).version;
if (!SEMVER.test(current))
  fail(`could not parse a current version from ${TAURI} (got "${current}")`);

const next = resolveNext(current, arg);
if (!SEMVER.test(next)) fail(`"${arg}" is not a valid version or bump keyword`);
if (next === current)
  fail(`new version equals current (${current}) — nothing to bump`);

// Source-of-truth files (required).
replaceOnce(TAURI, /("version":\s*")\d+\.\d+\.\d+(")/, `$1${next}$2`);
replaceOnce(CARGO_TOML, /(^version\s*=\s*")\d+\.\d+\.\d+(")/m, `$1${next}$2`);

// Cargo.lock: only the realtime-pdf [[package]] entry — a faithful 1-line mirror of Cargo.toml,
// identical to what `cargo` would write, so no compile step is needed just to update the lock.
replaceOnce(
  CARGO_LOCK,
  /(name = "realtime-pdf"\nversion = ")\d+\.\d+\.\d+(")/,
  `$1${next}$2`,
);

// Cosmetic: keep the private package.json in sync so humans/tools reading it aren't misled.
replaceOnce(PKG, /("version":\s*")\d+\.\d+\.\d+(")/, `$1${next}$2`);

console.error(
  `bumped ${current} -> ${next} in ${TAURI}, ${CARGO_TOML}, ${CARGO_LOCK}, ${PKG}`,
);
console.log(next);

function resolveNext(cur, spec) {
  const [maj, min, pat] = cur.split(".").map(Number);
  if (spec === "patch") return `${maj}.${min}.${pat + 1}`;
  if (spec === "minor") return `${maj}.${min + 1}.0`;
  if (spec === "major") return `${maj + 1}.0.0`;
  return spec.replace(/^v/, "");
}

function read(path) {
  return readFileSync(path, "utf8");
}

function replaceOnce(path, re, repl) {
  const txt = read(path);
  if (!re.test(txt))
    fail(`version pattern not found in ${path} — did the file format change?`);
  writeFileSync(path, txt.replace(re, repl));
}

function fail(msg) {
  console.error(`bump-version: ${msg}`);
  process.exit(1);
}
