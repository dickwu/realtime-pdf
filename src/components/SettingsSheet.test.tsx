import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import SettingsSheet from "./SettingsSheet";
import type { WatchHistoryEntry } from "@/lib/pdf";

const NOW = Date.parse("2026-09-04T12:00:00Z");

const invoice: WatchHistoryEntry = {
  path: "/Users/dev/Sites/app/storage/app/invoice.pdf",
  fileName: "invoice.pdf",
  lastOpenedAt: new Date(NOW - 3 * 60_000).toISOString(),
  hooks: [
    {
      id: "hook-a",
      watchPath: "/Users/dev/Sites/app/resources/views/pdf/invoice.blade.php",
      command: "php artisan test --filter=GeneratePdfTest",
      executionPath: "/Users/dev/Sites/app",
      enabled: true,
    },
    {
      id: "hook-b",
      watchPath: "/Users/dev/Sites/app/resources/css/pdf.css",
      command: "bun run build:pdf-css",
      executionPath: "~",
      enabled: false,
    },
  ],
};

const report: WatchHistoryEntry = {
  path: "/Users/dev/Sites/app/storage/app/report.pdf",
  fileName: "report.pdf",
  lastOpenedAt: new Date(NOW - 2 * 86_400_000).toISOString(),
  hooks: [],
};

const missing: WatchHistoryEntry = {
  path: "/Users/dev/old/gone.pdf",
  fileName: "gone.pdf",
  lastOpenedAt: new Date(NOW - 10 * 86_400_000).toISOString(),
  hooks: [],
};

function renderSheet(
  overrides: Partial<React.ComponentProps<typeof SettingsSheet>> = {},
) {
  const props: React.ComponentProps<typeof SettingsSheet> = {
    open: true,
    onClose: vi.fn(),
    selectedPdf: { path: invoice.path, fileName: invoice.fileName },
    watchTone: "live",
    watchMessage: "invoice.pdf is loaded. Watching for filesystem changes now.",
    pathInput: invoice.path,
    onPathInputChange: vi.fn(),
    onPickPdf: vi.fn(),
    onPathSubmit: vi.fn((event) => event.preventDefault()),
    isPicking: false,
    isWatchingPath: false,
    watchHistory: [invoice, report, missing],
    historyStatuses: {
      [missing.path]: {
        path: missing.path,
        fileName: "gone.pdf",
        exists: false,
      },
    },
    isCheckingHistory: false,
    historyError: null,
    onSelectHistory: vi.fn(),
    onRemoveHistory: vi.fn(),
    currentHistoryEntry: invoice,
    templateCandidates: [],
    copySourcePath: "",
    onCopySourceChange: vi.fn(),
    onCopyHooks: vi.fn(),
    onAddHook: vi.fn(),
    onUpdateHook: vi.fn(),
    onRemoveHook: vi.fn(),
    onToggleHook: vi.fn(),
    hookStatuses: {},
    hookPathStatuses: {},
    nowMs: NOW,
    updateCheckerSlot: <span>v9.9.9</span>,
    ...overrides,
  };

  render(<SettingsSheet {...props} />);
  return props;
}

describe("SettingsSheet", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders nothing while closed", () => {
    renderSheet({ open: false });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows the watched PDF with its shortened path and live state", () => {
    renderSheet();

    const dialog = screen.getByRole("dialog", { name: "Settings" });
    expect(dialog).toBeTruthy();
    expect(screen.getByText("invoice.pdf", { selector: "div" })).toBeTruthy();
    // The hero and the recents row both carry the full path as a title.
    expect(screen.getAllByTitle(invoice.path)[0].textContent).toBe(
      "~/Sites/app/storage/app/invoice.pdf",
    );
    expect(screen.getByText("Watching for changes")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Choose another PDF…" }),
    ).toBeTruthy();
    expect(screen.getByText("v9.9.9")).toBeTruthy();
  });

  it("explains a missing PDF instead of claiming it is watched", () => {
    renderSheet({
      watchTone: "error",
      watchMessage: "invoice.pdf is missing. Restore the file to reload it.",
    });

    expect(screen.queryByText("Watching for changes")).toBeNull();
    expect(
      screen.getByText(
        "invoice.pdf is missing. Restore the file to reload it.",
      ),
    ).toBeTruthy();
  });

  it("invites the user to choose a PDF when none is watched", () => {
    renderSheet({
      selectedPdf: null,
      currentHistoryEntry: null,
      pathInput: "",
      watchTone: "idle",
    });

    expect(screen.getByText("No PDF is being watched")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Choose PDF…" })).toBeTruthy();
    expect(
      screen.getByText("Watch a PDF first. Its hooks are set up here."),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add hook" })).toBeNull();
  });

  it("explains why it opened when the watched PDF vanished", () => {
    renderSheet({
      selectedPdf: null,
      currentHistoryEntry: null,
      watchTone: "error",
      watchMessage: "gone.pdf is missing. Restore the file to reload it.",
    });

    expect(screen.getByText("No PDF is being watched")).toBeTruthy();
    expect(
      screen.getByText("gone.pdf is missing. Restore the file to reload it."),
    ).toBeTruthy();
  });

  it("submits the typed path through the form", () => {
    const props = renderSheet();

    fireEvent.change(screen.getByLabelText("Watched PDF path"), {
      target: { value: "~/other.pdf" },
    });
    expect(props.onPathInputChange).toHaveBeenCalledWith("~/other.pdf");

    fireEvent.click(screen.getByRole("button", { name: "Watch" }));
    expect(props.onPathSubmit).toHaveBeenCalledTimes(1);
  });

  it("draws each hook as a rail with plain-language steps", () => {
    renderSheet();

    const first = screen.getByRole("article", { name: "Hook 1" });
    expect(first.textContent).toContain("When this file changes");
    expect(first.textContent).toContain("Run this command");
    expect(first.textContent).toContain("In this folder");
    expect(first.textContent).toContain("Then invoice.pdf reloads.");
    expect(first.textContent).toContain("Watching");

    expect(screen.getByLabelText("Hook 1 source file")).toHaveProperty(
      "value",
      invoice.hooks[0].watchPath,
    );
    expect(screen.getByLabelText("Hook 1 command")).toHaveProperty(
      "value",
      invoice.hooks[0].command,
    );

    const second = screen.getByRole("article", { name: "Hook 2" });
    expect(second.textContent).toContain("Disabled");
  });

  it("edits, toggles, and removes hooks through the callbacks", () => {
    const props = renderSheet();

    fireEvent.change(screen.getByLabelText("Hook 1 command"), {
      target: { value: "make pdf" },
    });
    expect(props.onUpdateHook).toHaveBeenCalledWith("hook-a", {
      command: "make pdf",
    });

    fireEvent.click(screen.getByRole("switch", { name: "Disable hook" }));
    expect(props.onToggleHook).toHaveBeenCalledWith("hook-a", false);

    fireEvent.click(screen.getByRole("switch", { name: "Enable hook" }));
    expect(props.onToggleHook).toHaveBeenCalledWith("hook-b", true);

    fireEvent.click(screen.getAllByRole("button", { name: "Remove hook" })[0]);
    expect(props.onRemoveHook).toHaveBeenCalledWith("hook-a");

    fireEvent.click(screen.getByRole("button", { name: "Add hook" }));
    expect(props.onAddHook).toHaveBeenCalledTimes(1);
  });

  it("surfaces the runtime message of a failing hook and a missing source", () => {
    renderSheet({
      hookStatuses: {
        "hook-a": {
          hookId: "hook-a",
          state: "error",
          message: "Execution path not found at /Users/dev/Sites/app.",
        },
      },
      hookPathStatuses: {
        "hook-a": {
          path: invoice.hooks[0].watchPath,
          fileName: "invoice.blade.php",
          exists: false,
        },
      },
    });

    const first = screen.getByRole("article", { name: "Hook 1" });
    expect(first.textContent).toContain("Error");
    expect(
      screen.getByText("Execution path not found at /Users/dev/Sites/app."),
    ).toBeTruthy();
    expect(screen.getByText("This file can't be found.")).toBeTruthy();
  });

  it("hides the routine watching message but keeps command output", () => {
    renderSheet({
      hookStatuses: {
        "hook-a": {
          hookId: "hook-a",
          state: "watching",
          message: "Watching /x and executing in /y",
        },
      },
    });
    expect(screen.queryByText("Watching /x and executing in /y")).toBeNull();

    cleanup();

    renderSheet({
      hookStatuses: {
        "hook-a": {
          hookId: "hook-a",
          state: "success",
          message: "Tests: 1 passed",
        },
      },
    });
    expect(screen.getByText("Tests: 1 passed")).toBeTruthy();
  });

  it("offers to copy hooks only once a source PDF is picked", () => {
    const props = renderSheet({
      templateCandidates: [{ ...report, hooks: invoice.hooks }],
    });

    const copy = screen.getByRole("button", { name: "Copy hooks" });
    expect(copy).toHaveProperty("disabled", true);

    fireEvent.change(screen.getByLabelText("Copy hooks from another PDF"), {
      target: { value: report.path },
    });
    expect(props.onCopySourceChange).toHaveBeenCalledWith(report.path);

    cleanup();
    renderSheet({
      templateCandidates: [{ ...report, hooks: invoice.hooks }],
      copySourcePath: report.path,
    });
    const enabledCopy = screen.getByRole("button", { name: "Copy hooks" });
    expect(enabledCopy).toHaveProperty("disabled", false);
    fireEvent.click(enabledCopy);
  });

  it("lists recent PDFs, opens the ones that exist, and marks the rest", () => {
    const props = renderSheet();

    expect(screen.getByText("Watching now")).toBeTruthy();
    expect(screen.getByText("Missing")).toBeTruthy();
    expect(screen.getByText("2 hooks")).toBeTruthy();
    expect(screen.getByText("3m ago")).toBeTruthy();
    expect(
      screen.getByText(
        "Files that can't be found stay listed until you remove them.",
      ),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Watch report.pdf" }));
    expect(props.onSelectHistory).toHaveBeenCalledWith(report.path);

    // Neither the current PDF nor a missing one is offered as a button.
    expect(
      screen.queryByRole("button", { name: "Watch invoice.pdf" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Watch gone.pdf" })).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: "Remove gone.pdf from recents" }),
    );
    expect(props.onRemoveHistory).toHaveBeenCalledWith(missing.path);
    expect(props.onSelectHistory).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape and via the close button", () => {
    const props = renderSheet();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(props.onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Close settings" }));
    expect(props.onClose).toHaveBeenCalledTimes(2);
  });
});
