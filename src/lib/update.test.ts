import { describe, expect, it } from "vitest";
import {
  isNewerReleaseVersion,
  normalizeReleaseVersion,
} from "@/lib/update";

describe("normalizeReleaseVersion", () => {
  it("strips a leading v prefix", () => {
    expect(normalizeReleaseVersion("v0.1.2")).toBe("0.1.2");
  });

  it("keeps plain versions unchanged", () => {
    expect(normalizeReleaseVersion("0.1.2")).toBe("0.1.2");
  });
});

describe("isNewerReleaseVersion", () => {
  it("detects a newer patch release", () => {
    expect(isNewerReleaseVersion("0.1.1", "v0.1.2")).toBe(true);
  });

  it("detects a newer minor release", () => {
    expect(isNewerReleaseVersion("0.1.9", "0.2.0")).toBe(true);
  });

  it("handles multi-digit segments correctly", () => {
    expect(isNewerReleaseVersion("0.1.9", "0.1.10")).toBe(true);
  });

  it("returns false for the same release", () => {
    expect(isNewerReleaseVersion("0.1.1", "v0.1.1")).toBe(false);
  });

  it("returns false for an older release", () => {
    expect(isNewerReleaseVersion("0.2.0", "0.1.9")).toBe(false);
  });
});
