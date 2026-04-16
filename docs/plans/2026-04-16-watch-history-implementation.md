# Watch History Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add permanent saved watch-file history in the settings modal, disable missing paths instead of removing them, and move the current watched path to the top whenever it is reopened.

**Architecture:** Extend the existing Tauri Store preferences model with a persisted `watchHistory` array, add a small Rust command to check whether saved paths still exist, and render the history list in the modal with availability-aware actions. Keep history validation on-demand when the settings modal opens instead of creating extra filesystem watchers.

**Tech Stack:** Next.js app router, React state/hooks, Tauri v2 commands/events, Tauri Store plugin, Rust std filesystem checks, Vitest utilities.

---

### Task 1: Add shared history types and ordering helpers

**Files:**
- Modify: `src/lib/pdf.ts`
- Test: `src/lib/pdf.test.ts`

**Step 1: Add `WatchHistoryEntry` and `HistoryItemState` types plus pure helpers**

- Add helpers for:
  - upserting a watched path to the top of history
  - removing a path from history
  - keeping stable ordering without duplicates

**Step 2: Add tests for history reorder and removal behavior**

- Verify:
  - new item inserts at top
  - existing item moves to top
  - duplicate paths collapse to one entry
  - remove deletes only the targeted path

**Step 3: Run tests**

Run: `bun test`

**Step 4: Commit checkpoint**

- Commit only after tests pass.

### Task 2: Add Rust command for existence checks

**Files:**
- Modify: `src-tauri/src/lib.rs`

**Step 1: Add a serializable response for path status**

- Response shape:
  - `path`
  - `exists`
  - `fileName`

**Step 2: Add a new Tauri command**

- Command takes `Vec<String>` or a single array argument of saved paths.
- Reuse existing path parsing/canonicalization rules where safe.
- For missing files, avoid failing the whole call; return `exists: false`.

**Step 3: Register the command in `invoke_handler!`**

**Step 4: Run Rust formatting/check**

Run:
- `cargo fmt --manifest-path src-tauri/Cargo.toml`
- `cargo check --manifest-path src-tauri/Cargo.toml`

### Task 3: Persist history in the frontend preferences layer

**Files:**
- Modify: `src/app/page.tsx`

**Step 1: Add frontend state for persisted history and checked status**

- Add:
  - `watchHistory`
  - `historyStates`
  - loading flag for history checks

**Step 2: Load `watchHistory` from Tauri Store during startup restore**

- Default to `[]`.
- Keep current `watchPath` and `zoom` restore behavior intact.

**Step 3: Save history whenever a path is successfully watched**

- Upsert current item to top with:
  - `path`
  - `fileName`
  - current ISO timestamp

**Step 4: Save history back to Store**

- Persist without breaking existing `watchPath` / `zoom` writes.

### Task 4: Add modal history UI and actions

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/app/globals.css`

**Step 1: Add a “Saved history” section to the settings modal**

- Each row shows:
  - file name
  - path
  - availability badge
  - `Use` button when available
  - `Current` badge instead of `Use` for the active path
  - `Remove` button always

**Step 2: Disable non-existent paths**

- Missing items stay visible.
- `Use` action is disabled when `exists === false`.

**Step 3: Wire row actions**

- `Use` reuses the existing `watch_pdf_path` flow.
- `Remove` updates local state and store immediately.

**Step 4: Add styling**

- Keep the modal readable with long paths.
- Make missing rows visibly distinct without hiding them.

### Task 5: Re-check history when settings opens

**Files:**
- Modify: `src/app/page.tsx`

**Step 1: Trigger existence checks when the modal opens**

- Call the new Rust command with all saved history paths.
- Store the results by path for rendering.

**Step 2: Refresh checks after successful watch or removal**

- Keep modal state consistent after user actions.

**Step 3: Handle partial failures**

- If checks fail, preserve the saved list and surface a non-blocking status message.

### Task 6: Final verification

**Files:**
- Modify if needed: `package.json`, `src-tauri/Cargo.toml`, `bun.lock`, `src-tauri/Cargo.lock`

**Step 1: Run the full verification pass**

Run:
- `bun test`
- `bunx tsc --noEmit`
- `bunx tauri build --debug --no-bundle`

**Step 2: Remove generated build artifacts**

- Clean `.next`, `dist`, `src-tauri/gen`, `src-tauri/target`, and `tsconfig.tsbuildinfo` after verification.

**Step 3: Manual QA checklist**

- Open settings with no history.
- Watch one path and confirm it is saved.
- Watch a second path and confirm it moves to the top.
- Re-watch the first path and confirm it returns to the top without duplication.
- Temporarily remove a watched file, reopen settings, and confirm its history row is disabled but removable.
- Confirm zoom persistence still works after reopen and after PDF reload events.

