---
name: tauri-ipc
description: Checklist for changing the Rust ↔ frontend boundary of this Tauri v2 app — adding or modifying a #[tauri::command], an emitted event, a serde payload struct, a Tauri plugin, or a capability permission. Use whenever an edit touches commands or events in src-tauri/src/lib.rs, the shared types in src/lib/pdf.ts, src-tauri/capabilities/default.json, or invoke()/listen() calls in src/app/page.tsx.
---

# Tauri IPC checklist

Everything crossing the Rust ↔ webview boundary is declared twice, once per language, and no
compiler checks that the two sides agree. Walk the relevant section, tick every item, then run the
verification at the end.

## Adding or changing a command

1. Define it in `src-tauri/src/lib.rs` beside the existing commands (`pick_pdf_path`,
   `watch_pdf_path`, `check_history_paths`, `set_history_watchers`, `set_active_hooks`):

   ```rust
   #[tauri::command]
   async fn my_command(
       app: AppHandle,               // only if you emit events or need the app handle
       state: State<'_, WatchState>, // only if you touch watcher state
       some_arg: String,
   ) -> Result<MyPayload, String> { /* … */ }
   ```

   Error strings are shown to the user verbatim, so write them like
   `format!("Failed to resolve the selected path: {error}")`. Commands that cannot fail return
   the value directly (see `check_history_paths`).
2. Register it in `tauri::generate_handler![ … ]` inside `run()` at the bottom of `lib.rs`.
   Forgetting this compiles fine and fails at runtime with "command not found".
3. Call it from `src/app/page.tsx` with `invoke<ReturnType>("my_command", { someArg })`. Tauri
   renames snake_case Rust parameters to camelCase on the JS side (`require_pdf` → `requirePdf`);
   the command name itself stays snake_case.
4. Catch the rejection and turn it into user-facing state, matching the existing
   `setHistoryError` pattern. The rejection value is the plain `String` from the Rust `Err`.

## Payload structs

- Derive `Serialize` (plus `Deserialize` for inputs) with `#[serde(rename_all = "camelCase")]`,
  like `PdfSelection`, `WatchHook`, and `HistoryPathStatus`.
- Mirror the shape as an `export type` in `src/lib/pdf.ts`. `Option<T>` becomes `T | null`
  (serde serialises `None` as `null`), `u64` becomes `number`, and `&'static str` state tags
  become string-literal unions (see `HookRuntimeState`).
- Change both sides in the same edit. Nothing checks them against each other except the runtime.

## Events (Rust → frontend)

1. Name the event once as a const in **both** files: `const X_EVENT: &str = "kebab-case-name";`
   near the top of `lib.rs` and `const X_EVENT = "kebab-case-name";` near the top of `page.tsx`.
   The current three are `pdf-file-state`, `hook-status`, and `history-path-status`.
2. Emit from Rust through a small helper that builds the payload struct and calls
   `let _ = app.emit(X_EVENT, payload);` (see `emit_pdf_event` and `emit_hook_status`).
3. Listen in `page.tsx` inside a `useEffect` guarded by `if (!isTauri()) return;`. Keep the
   unlisten function returned by `listen<Payload>(X_EVENT, handler)` and call it in the effect
   cleanup; use a `cancelled` flag when the listener is registered asynchronously (see the
   history-status effect). `reactStrictMode` is on, so a listener without cleanup registers twice
   in dev.

## Plugins and permissions

1. Rust side: `cargo add tauri-plugin-foo --manifest-path src-tauri/Cargo.toml`, then
   `.plugin(tauri_plugin_foo::init())` in the builder chain in `run()`.
2. JS side: `bun add @tauri-apps/plugin-foo`, which also updates `bun.lock`.
3. Grant it in `src-tauri/capabilities/default.json`: `foo:default` plus any `foo:allow-<command>`
   the JS side calls (compare `dialog:default` + `dialog:allow-open`). Core APIs use
   `core:<module>:allow-<command>`, e.g. `core:window:allow-start-dragging`. A missing permission
   compiles fine and fails only at runtime with a "not allowed" error in the webview console.
4. If the plugin loads remote content, extend the CSP in `src-tauri/tauri.conf.json`. Keep
   `'wasm-unsafe-eval'` in `script-src`; `src/lib/tauri-config.test.ts` fails without it.
5. `src-tauri/gen/schemas/` regenerates on the next build. It is gitignored; never edit or commit it.

## Verify

```bash
cargo check --manifest-path src-tauri/Cargo.toml
bunx tsc --noEmit
bun run test
grep -n '_EVENT' src-tauri/src/lib.rs src/app/page.tsx   # event names must match pairwise
```

Registration and permission mistakes surface only at runtime, so for those changes also launch
`bunx tauri dev` and exercise the feature once, or ask the user to. Run `/preflight` before
committing.
