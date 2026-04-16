# Realtime PDF Icon Design

Date: 2026-04-16

Approved direction:
- Tauri-inspired circular mark
- Centered PDF document silhouette
- Blue primary arc plus warm orange accent arc
- Clean enough to read at `128x128` and smaller

Design notes:
- Avoid tiny text inside the icon; use document shape and red document accent to communicate PDF.
- Keep the icon on a transparent background so it works in desktop bundles and app launchers.
- Use a bold white document panel with a folded corner so the PDF cue survives downscaling.
- Keep the circular motion cues asymmetric so it still feels related to the Tauri mark rather than a generic ring.

Implementation plan:
1. Create one SVG master asset.
2. Render `icon.png` and `128x128.png` from the SVG.
3. Generate `icon.icns` and `icon.ico` from the rendered master.
4. Visually review the result and keep only the final assets in `src-tauri/icons/`.

