import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

type CspValue = string | Record<string, string | string[]> | null | undefined;

function readTauriCsp(): CspValue {
  const configPath = path.join(process.cwd(), "src-tauri", "tauri.conf.json");
  const rawConfig = fs.readFileSync(configPath, "utf8");
  const config = JSON.parse(rawConfig) as {
    app?: {
      security?: {
        csp?: CspValue;
      };
    };
  };

  return config.app?.security?.csp;
}

function getDirectiveSources(csp: CspValue, directiveName: string): string[] {
  if (!csp) return [];

  if (typeof csp === "string") {
    const directive = csp
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${directiveName} `));

    if (!directive) return [];

    return directive
      .slice(directiveName.length)
      .trim()
      .split(/\s+/)
      .filter(Boolean);
  }

  const directive = csp[directiveName];

  if (!directive) return [];

  if (Array.isArray(directive)) {
    return directive;
  }

  return directive.split(/\s+/).filter(Boolean);
}

describe("Tauri security config", () => {
  it("allows WebAssembly in script-src for the embedded PDF viewer", () => {
    const scriptSrc = getDirectiveSources(readTauriCsp(), "script-src");

    expect(scriptSrc).toContain("'wasm-unsafe-eval'");
  });
});
