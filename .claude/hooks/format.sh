#!/bin/sh
# Claude Code PostToolUse hook (matcher: Write|Edit) — format the file that was just written.
# Prettier (default config) for frontend files, rustfmt --edition 2024 for Rust.
# Always exits 0; a formatter failure is surfaced to the user as a systemMessage, never blocks.
set -u

file=$(jq -r '.tool_response.filePath // .tool_input.file_path // empty' 2>/dev/null)
[ -n "$file" ] && [ -f "$file" ] || exit 0

root=${CLAUDE_PROJECT_DIR:-$(pwd)}
case "$file" in
  "$root"/dist/*|"$root"/node_modules/*|"$root"/src-tauri/target/*|"$root"/src-tauri/gen/*) exit 0 ;;
esac

case "$file" in
  *.ts|*.tsx|*.mjs|*.js|*.css|*.json)
    tool=prettier
    out=$(cd "$root" && bunx prettier --write --log-level warn "$file" 2>&1)
    status=$?
    ;;
  *.rs)
    tool=rustfmt
    out=$(rustfmt --edition 2024 "$file" 2>&1)
    status=$?
    ;;
  *) exit 0 ;;
esac

if [ "$status" -ne 0 ]; then
  first=$(printf '%s\n' "$out" | grep -v '^$' | head -n 1 | cut -c1-200)
  jq -n --arg m "format hook: $tool failed on ${file#"$root"/}: $first" '{systemMessage: $m}'
fi
exit 0
