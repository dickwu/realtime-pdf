# Realtime PDF

Desktop PDF watcher for macOS built with Tauri, Next.js, and React.

Realtime PDF watches a target PDF file, reloads it when the file changes on disk, keeps a persistent saved-history list, and can run per-PDF source hooks that regenerate the PDF when related files such as Laravel Blade templates change.

## Features

- Full-window PDF viewer powered by `@embedpdf/react-pdf-viewer`
- Persistent saved PDF history with disabled-but-removable missing entries
- Per-PDF hook lists
- Multiple hooks per PDF
- Hook template copy from another saved PDF
- Hook fields:
  - watch path
  - execute command
  - execution path
  - enabled toggle
- Debounced hook execution
- Persisted zoom level
- Persistent restore of the last watched PDF on reopen

## Install

### Homebrew

```bash
brew tap dickwu/tap
brew install --cask realtime-pdf
```

### If macOS says the app is damaged or cannot be opened

```bash
sudo xattr -rd com.apple.quarantine "/Applications/Realtime PDF.app"
```

## Usage

1. Open the app.
2. Click `Settings`.
3. Pick a PDF or paste a PDF path.
4. Reopen `Settings` to manage:
   - saved PDF history
   - hook definitions for the active PDF
   - hook templates copied from another saved PDF

### Hook example

For a Laravel-generated PDF, one hook might be:

- Watch path: `~/Sites/app/resources/views/pdf/invoice.blade.php`
- Execution path: `~/Sites/app`
- Execute command: `php artisan test --filter=GenerateInvoicePdfTest`

If that command regenerates the watched PDF file, Realtime PDF reloads it automatically through the existing PDF watcher.

## Development

### Prerequisites

- Bun
- Rust toolchain
- Tauri desktop build prerequisites for macOS

### Run

```bash
bun install
bun run dev
```

Run the desktop app with:

```bash
bunx tauri dev
```

### Verify

```bash
bun test
bunx tsc --noEmit
cargo check --manifest-path src-tauri/Cargo.toml
bunx tauri build --debug --no-bundle
```

## Release

This repo ships with:

- CI workflow for tests, TypeScript, and Tauri build validation
- Tagged release workflow for macOS DMG artifacts
- Automatic Homebrew tap cask update for `dickwu/homebrew-tap`

Create a release by pushing a tag:

```bash
git tag v0.1.2
git push origin v0.1.2
```

The release workflow will:

1. Build macOS DMG artifacts for Apple Silicon and Intel
2. Create or update the GitHub release
3. Update `dickwu/homebrew-tap` with the new cask version and SHA256 values

## Project Structure

- `src/app/page.tsx` — main app UI
- `src/components/PdfViewer.tsx` — EmbedPDF wrapper
- `src/lib/pdf.ts` — shared viewer/history/hook types and helpers
- `src-tauri/src/lib.rs` — Tauri commands, PDF watcher, hook watcher runner
- `.github/workflows/` — CI and release automation

## License

MIT
