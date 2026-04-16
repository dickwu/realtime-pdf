# Watch History Settings Design

Date: 2026-04-16

## Goal

Add a permanent, user-managed watch-file history to the settings modal so previously watched PDF paths can be reselected quickly, while clearly showing which saved paths are currently missing from disk.

## Approved Behavior

- Persist history until the user explicitly removes entries.
- Keep missing paths visible in the history list.
- Mark missing paths as disabled so they cannot be selected.
- Allow removing any history entry, including missing ones.
- When a watched path already exists in history, move it to the top and treat it as the current item.

## UX Shape

- Settings stays behind the existing floating settings button and modal.
- The modal gains a “Saved history” section under the watch-path input.
- Each history row shows:
  - file name
  - full path
  - current availability state (`Available` or `Missing`)
  - selection action when available
  - remove action always
- The currently active watched file stays pinned at the top through the reorder-on-watch rule.

## Data Model

Persist in Tauri Store:

- `watchPath: string`
- `zoom: number`
- `watchHistory: Array<{ path: string; fileName: string; lastOpenedAt: string }>`

Notes:

- `fileName` is denormalized for fast rendering and stable labels when the file is temporarily missing.
- `lastOpenedAt` is only for ordering/debug value; the primary ordering rule is “most recently watched goes to the top”.

## Existence Checks

- Do not create background watchers for every historical path.
- Re-check file existence when the settings modal opens.
- Re-check again after a successful save/watch action or history removal.
- Use a lightweight Rust command for path existence so the frontend gets authoritative filesystem answers without widening webview access.

## Non-Goals

- No automatic pruning of missing entries.
- No manual drag sorting.
- No multi-file watch mode.
- No global background validation outside the settings modal lifecycle.

