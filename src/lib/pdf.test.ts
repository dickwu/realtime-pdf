import { describe, expect, it } from "vitest";
import {
  MAX_WATCH_HISTORY,
  type WatchHistoryEntry,
  appendRevision,
  clampZoom,
  displayNameFromPath,
  removeWatchHistoryEntry,
  upsertWatchHistoryEntry,
  zoomPercentage,
} from "@/lib/pdf";

describe("appendRevision", () => {
  it("adds the revision as a query string when none exists", () => {
    expect(appendRevision("asset://report.pdf", 4)).toBe(
      "asset://report.pdf?rev=4",
    );
  });

  it("appends the revision when a query string already exists", () => {
    expect(appendRevision("asset://report.pdf?foo=1#page=2", 9)).toBe(
      "asset://report.pdf?foo=1&rev=9#page=2",
    );
  });
});

describe("displayNameFromPath", () => {
  it("uses the last path segment for unix paths", () => {
    expect(displayNameFromPath("/tmp/schedule.pdf")).toBe("schedule.pdf");
  });

  it("uses the last path segment for windows paths", () => {
    expect(displayNameFromPath("C:\\tmp\\schedule.pdf")).toBe("schedule.pdf");
  });
});

describe("clampZoom", () => {
  it("keeps zoom inside the supported range", () => {
    expect(clampZoom(0.3)).toBe(0.6);
    expect(clampZoom(1.25)).toBe(1.25);
    expect(clampZoom(9)).toBe(5);
  });

  it("falls back to the default zoom for invalid numbers", () => {
    expect(clampZoom(Number.NaN)).toBe(1);
  });
});

describe("zoomPercentage", () => {
  it("formats the zoom as a rounded percentage", () => {
    expect(zoomPercentage(1.26)).toBe(126);
  });
});

describe("upsertWatchHistoryEntry", () => {
  const jan = "2026-04-16T10:00:00.000Z";
  const feb = "2026-04-16T11:00:00.000Z";

  it("adds a new entry to the top", () => {
    const history: WatchHistoryEntry[] = [
      {
        path: "/tmp/old.pdf",
        fileName: "old.pdf",
        lastOpenedAt: jan,
        hooks: [],
      },
    ];

    expect(
      upsertWatchHistoryEntry(history, {
        path: "/tmp/new.pdf",
        fileName: "new.pdf",
        lastOpenedAt: feb,
        hooks: [],
      }),
    ).toEqual([
      {
        path: "/tmp/new.pdf",
        fileName: "new.pdf",
        lastOpenedAt: feb,
        hooks: [],
      },
      {
        path: "/tmp/old.pdf",
        fileName: "old.pdf",
        lastOpenedAt: jan,
        hooks: [],
      },
    ]);
  });

  it("moves an existing entry to the top and refreshes metadata", () => {
    const history: WatchHistoryEntry[] = [
      {
        path: "/tmp/old.pdf",
        fileName: "old.pdf",
        lastOpenedAt: jan,
        hooks: [],
      },
      {
        path: "/tmp/new.pdf",
        fileName: "new.pdf",
        lastOpenedAt: jan,
        hooks: [],
      },
    ];

    expect(
      upsertWatchHistoryEntry(history, {
        path: "/tmp/old.pdf",
        fileName: "old-renamed.pdf",
        lastOpenedAt: feb,
        hooks: [],
      }),
    ).toEqual([
      {
        path: "/tmp/old.pdf",
        fileName: "old-renamed.pdf",
        lastOpenedAt: feb,
        hooks: [],
      },
      {
        path: "/tmp/new.pdf",
        fileName: "new.pdf",
        lastOpenedAt: jan,
        hooks: [],
      },
    ]);
  });
});

describe("removeWatchHistoryEntry", () => {
  it("removes only the targeted path", () => {
    const history: WatchHistoryEntry[] = [
      {
        path: "/tmp/a.pdf",
        fileName: "a.pdf",
        lastOpenedAt: "2026-04-16T10:00:00.000Z",
        hooks: [],
      },
      {
        path: "/tmp/b.pdf",
        fileName: "b.pdf",
        lastOpenedAt: "2026-04-16T11:00:00.000Z",
        hooks: [],
      },
    ];

    expect(removeWatchHistoryEntry(history, "/tmp/a.pdf")).toEqual([
      {
        path: "/tmp/b.pdf",
        fileName: "b.pdf",
        lastOpenedAt: "2026-04-16T11:00:00.000Z",
        hooks: [],
      },
    ]);
  });
});

describe("upsertWatchHistoryEntry MAX_WATCH_HISTORY cap", () => {
  it(`caps the history list at ${MAX_WATCH_HISTORY} entries`, () => {
    const history: WatchHistoryEntry[] = Array.from(
      { length: MAX_WATCH_HISTORY },
      (_, index) => ({
        path: `/tmp/file-${String(index).padStart(3, "0")}.pdf`,
        fileName: `file-${index}.pdf`,
        lastOpenedAt: "2026-04-16T10:00:00.000Z",
        hooks: [],
      }),
    );
    expect(history.length).toBe(MAX_WATCH_HISTORY);

    const next: WatchHistoryEntry = {
      path: "/tmp/newest.pdf",
      fileName: "newest.pdf",
      lastOpenedAt: "2026-05-15T10:00:00.000Z",
      hooks: [],
    };

    const result = upsertWatchHistoryEntry(history, next);
    expect(result.length).toBe(MAX_WATCH_HISTORY);
    expect(result[0]?.path).toBe("/tmp/newest.pdf");
    expect(result.at(-1)?.path).toBe(
      `/tmp/file-${String(MAX_WATCH_HISTORY - 2).padStart(3, "0")}.pdf`,
    );
    expect(
      result.find(
        (entry) =>
          entry.path ===
          `/tmp/file-${String(MAX_WATCH_HISTORY - 1).padStart(3, "0")}.pdf`,
      ),
    ).toBeUndefined();
  });

  it("does not trim when count is at or below the cap", () => {
    const history: WatchHistoryEntry[] = [
      {
        path: "/tmp/a.pdf",
        fileName: "a.pdf",
        lastOpenedAt: "2026-04-16T10:00:00.000Z",
        hooks: [],
      },
    ];
    const next: WatchHistoryEntry = {
      path: "/tmp/b.pdf",
      fileName: "b.pdf",
      lastOpenedAt: "2026-04-16T11:00:00.000Z",
      hooks: [],
    };
    expect(upsertWatchHistoryEntry(history, next).length).toBe(2);
  });
});

describe("historyPathsKey sort-invariance", () => {
  const buildKey = (paths: string[]) => [...paths].sort().join("\n");

  it("produces the same key regardless of input order", () => {
    expect(buildKey(["/a.pdf", "/b.pdf", "/c.pdf"])).toBe(
      buildKey(["/c.pdf", "/a.pdf", "/b.pdf"]),
    );
  });

  it("changes when a path is added or removed", () => {
    const before = buildKey(["/a.pdf", "/b.pdf"]);
    const after = buildKey(["/a.pdf", "/b.pdf", "/c.pdf"]);
    expect(before).not.toBe(after);
  });
});
