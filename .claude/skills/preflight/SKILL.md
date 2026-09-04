---
name: preflight
description: Run this repo's full local verification set (lockfile sync, vitest, tsc, next build, eslint, cargo check, cargo clippy, cargo test, format check on changed files) and report pass/fail per step. Pass `full` to also run the Tauri debug build. Use before committing, before reporting a change as done, and whenever the user asks to verify, check, or "run CI locally".
---

# Preflight — run the CI checks locally

Run every step below from the repo root and collect each exit code. Do not stop at the first
failure: the user wants the full picture in one pass. Never report a change as done, and never
commit, while any step is red.

Arguments: `$ARGUMENTS`. If it contains `full`, also run Step 8.

## Steps

1. **Lockfile sync.** `bun install`. If `git diff --quiet bun.lock` afterwards fails, the lockfile
   was stale versus `package.json`; CI (`bun install --frozen-lockfile`) would have failed. Note it
   so the updated `bun.lock` gets committed with the `package.json` change.
2. **Vitest.** `bun run test` (never `bun test`).
3. **Typecheck.** `bunx tsc --noEmit`.
4. **Next build.** `bun run build`. Writes to `dist/`, which is gitignored.
5. **Lint.** `bun run lint` (ESLint flat config in `eslint.config.mjs`, Next + typescript-eslint rules).
6. **Rust.** `cargo check --manifest-path src-tauri/Cargo.toml`,
   `cargo clippy --manifest-path src-tauri/Cargo.toml`, then
   `cargo test --manifest-path src-tauri/Cargo.toml`. CI never runs clippy or the Rust tests, so
   this is the only place they run.
7. **Formatting of changed files.** Only files touched in the working tree, so pre-existing drift
   elsewhere is not your problem:

   ```bash
   { git diff --name-only HEAD; git ls-files --others --exclude-standard; } | sort -u > /tmp/preflight-changed
   grep -E '\.(ts|tsx|mjs|js|css|json)$' /tmp/preflight-changed | grep -vE '^(dist|src-tauri/gen|src-tauri/target|node_modules)/' | xargs -r bunx prettier --check
   grep -E '\.rs$' /tmp/preflight-changed | xargs -r rustfmt --edition 2024 --check
   ```

   Bare `rustfmt` without `--edition 2024` fails on this crate; always pass the flag.
8. **Tauri debug build** (only with `full`). `bunx tauri build --debug --no-bundle`. This takes
   minutes; run it with `run_in_background` and keep going.

Steps 2–6 are independent of each other. Run the slow ones (4, 6, 8) in the background and the
fast ones in the foreground, then gather results.

## Report

Print one line per step: step name, `PASS`/`FAIL`, and for failures the first relevant error
lines (test name, TS error code and file:line, or rustc error). Then one verdict line:
`preflight: all green` or `preflight: N step(s) failed`.

If anything failed, fix it and rerun only the failed steps, then rerun the whole set once more
before claiming done. Fix formatting failures with `bunx prettier --write <file>` or
`rustfmt --edition 2024 <file>` rather than by hand.
