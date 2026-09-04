# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Realtime PDF is a macOS-only Tauri v2 desktop app: Rust backend in `src-tauri/`, Next.js 16 static-export frontend (React 19, strict TypeScript) in `src/`. The package manager is **bun**, never npm or yarn.

## Commands

- `bunx tauri dev` — run the desktop app. Its before-dev script reuses a Next dev server on `127.0.0.1:3000` only when that server's cwd is this repo, and exits if another project holds the port. `bun run dev` alone serves the page in a browser, where everything Tauri-gated is disabled.
- `bun run test` — Vitest. Never `bun test`: that is Bun's native runner and fails on `vi.*`. Single file: `bunx vitest run src/lib/pdf.test.ts`. By name: `bunx vitest run -t "name"`.
- `cargo test --manifest-path src-tauri/Cargo.toml` — Rust tests. CI does not run them, so run them yourself.
- `bunx tsc --noEmit`, `bun run build`, `cargo check --manifest-path src-tauri/Cargo.toml`, `bunx tauri build --debug --no-bundle` — the rest of what CI (`.github/workflows/ci.yml`) verifies.
- `bun run lint` (ESLint, `eslint.config.mjs`) and `cargo clippy --manifest-path src-tauri/Cargo.toml` — linters. Neither runs in CI, so run them yourself.
- Format Rust with `rustfmt --edition 2024 <file>`. Bare `rustfmt` assumes edition 2015 and fails on this crate. Prettier with its default config formats everything else.
- In `package.json`, `typescript` is an npm alias for `@typescript/typescript6` (the 6.0 compiler API that typescript-eslint needs) and `@typescript/native` aliases TypeScript 7, which provides the `tsc` binary. Leave both aliases as they are.
- ESLint stays on 9.x: `eslint-plugin-react` (pulled in by `eslint-config-next`) does not support ESLint 10.

## Workflow

- Before committing or reporting a change as done, run the full check set with `/preflight` (vitest, tsc, next build, eslint, cargo check, clippy, cargo test). Use `/preflight full` to add the Tauri debug build when Rust or `tauri.conf.json` changed.
- Commit directly to `main`. No feature branches or PRs unless asked.
- Conventional Commits: `type(scope): summary`, e.g. `feat(recents): …`, `fix(updater): …`, `chore(deps): …`. Release commits are exactly `chore(release): bump version to vX.Y.Z`.
- After editing `package.json`, run `bun install` so `bun.lock` follows. CI installs with `--frozen-lockfile` and fails on a stale lockfile.
- Never hand-edit generated output: `dist/`, `next-env.d.ts`, `src-tauri/gen/`, `src-tauri/target/`.

## Releasing

Releases happen only by pushing a `vX.Y.Z` tag. `release.yml` builds, signs, publishes the GitHub Release, and updates the Homebrew tap. Never run `gh release create`. The version lives in four files (`src-tauri/tauri.conf.json` is the source of truth, plus `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `package.json`). Use `/cut-release`, which handles all of it.

## Rust ↔ frontend boundary

The `tauri-ipc` skill has the full checklist. The rules that bite:

- Every `#[tauri::command]` in `src-tauri/src/lib.rs` must be listed in `tauri::generate_handler![…]` inside `run()`. Fallible commands return `Result<T, String>` with a user-facing message.
- Tauri converts snake_case command arguments to camelCase on the JS side: Rust `require_pdf` is called as `invoke("check_history_paths", { requirePdf })`. Payload structs use `#[serde(rename_all = "camelCase")]` and mirror the TS types in `src/lib/pdf.ts`; update both.
- Event names are duplicated as consts in `lib.rs` and `src/app/page.tsx` (`pdf-file-state`, `hook-status`, `history-path-status`). Change both or the listener goes silent.
- A new plugin API needs a permission in `src-tauri/capabilities/default.json`; a new plugin also needs `.plugin(…)` registration in `run()`. Permission errors surface only at runtime.
- The CSP in `tauri.conf.json` must keep `'wasm-unsafe-eval'` in `script-src` for the pdfium WASM viewer; `src/lib/tauri-config.test.ts` enforces it. `https://cdn.jsdelivr.net` is the only external origin allowed.

## Frontend conventions

- Styling is inline `style={{}}` objects built from the CSS variables in `src/lib/theme.ts`. No Tailwind, CSS modules, or component library.
- `src/app/page.tsx` owns the app state and every `invoke`/`listen` for the app's own commands; components under `src/components/` are presentational and receive callbacks.
- Tests are colocated as `src/**/*.test.{ts,tsx}` on happy-dom; each file mocks the `@tauri-apps/*` modules it needs with `vi.mock`.

## Runtime notes

- File watchers watch the parent directory non-recursively and filter by canonical path so atomic-replace saves are seen. Don't simplify them to watch the file itself.
- Persisted settings (watch path, zoom, history, theme) live in `~/Library/Application Support/com.gwddeveloper.realtime-pdf/settings.json` via tauri-plugin-store.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
