import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Pre-existing in src/app/page.tsx and src/components/PdfViewer.tsx.
      // Promote back to "error" once those effects are refactored.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  {
    // next.config.js is intentionally CommonJS (module.exports / require).
    files: ["*.config.js", "*.config.cjs"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  {
    // Test-only idioms: require() inside vi.mock factories, `arguments` in stubs.
    files: ["src/**/*.test.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-require-imports": "warn",
      "prefer-rest-params": "warn",
    },
  },
  // Next writes its static export to dist/ (distDir), not .next/.
  globalIgnores(["dist/**", "src-tauri/**", "next-env.d.ts", ".omc/**"]),
]);
