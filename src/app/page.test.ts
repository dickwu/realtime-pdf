import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Home from "@/app/page";

const listenMock = vi.fn();
const invokeMock = vi.fn();
const storeGetMock = vi.fn();
const storeSetMock = vi.fn();
const storeCloseMock = vi.fn();

const viewerPropsLog: Array<Record<string, unknown>> = [];

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: vi.fn((path: string) => `asset://${path}`),
  invoke: (...args: unknown[]) => invokeMock(...args),
  isTauri: vi.fn(() => true),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: (...args: unknown[]) => listenMock(...args),
}));

vi.mock("@tauri-apps/plugin-store", () => ({
  LazyStore: class MockLazyStore {
    async get(key: string) {
      return storeGetMock(key);
    }

    async set(key: string, value: unknown) {
      return storeSetMock(key, value);
    }

    async close() {
      return storeCloseMock();
    }
  },
}));

vi.mock("@/components/UpdateChecker", () => ({
  default: function MockUpdateChecker() {
    return null;
  },
}));

vi.mock("@/components/PdfViewer", () => ({
  default: function MockPdfViewer(props: Record<string, unknown>) {
    viewerPropsLog.push(props);

    return React.createElement(
      "button",
      {
        type: "button",
        "data-testid": "mock-pdf-viewer",
        onClick: () => {
          const onScrollChange = props.onScrollChange as
            | ((offset: { x: number; y: number }) => void)
            | undefined;
          onScrollChange?.({ x: 33, y: 480 });
        },
      },
      "Mock viewer",
    );
  },
}));

describe("Home scroll restoration", () => {
  const initialLastModifiedMs = Date.parse("2026-04-17T12:34:56.000Z");
  const fixedNowMs = initialLastModifiedMs + 38_000;
  let dateNowSpy: ReturnType<typeof vi.spyOn> | null = null;

  beforeEach(() => {
    viewerPropsLog.length = 0;
    dateNowSpy = vi.spyOn(Date, "now").mockReturnValue(fixedNowMs);

    listenMock.mockReset();
    listenMock.mockResolvedValue(() => {});

    invokeMock.mockReset();
    invokeMock.mockImplementation((command: string, payload: { path: string }) => {
      if (command === "watch_pdf_path") {
        return Promise.resolve({
          path: payload.path,
          fileName: "report.pdf",
          revision: 7,
          lastModifiedMs: initialLastModifiedMs,
        });
      }

      if (command === "check_history_paths" || command === "set_active_hooks") {
        return Promise.resolve([]);
      }

      return Promise.reject(new Error(`Unhandled command: ${command}`));
    });

    storeGetMock.mockReset();
    storeGetMock.mockImplementation((key: string) => {
      if (key === "watchPath") return "/tmp/report.pdf";
      if (key === "zoom") return 1;
      if (key === "watchHistory") return [];
      if (key === "scrollOffsets") {
        return {
          "/tmp/report.pdf": { x: 12, y: 240 },
        };
      }
      return undefined;
    });

    storeSetMock.mockReset();
    storeCloseMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    dateNowSpy?.mockRestore();
    dateNowSpy = null;
    cleanup();
    vi.clearAllMocks();
  });

  it("hydrates the saved scroll offset into the viewer when restoring the watched PDF", async () => {
    render(React.createElement(Home));

    await waitFor(() =>
      expect(viewerPropsLog.at(-1)?.initialScrollOffset).toEqual({ x: 12, y: 240 }),
    );
  });

  it("shows the watched file modified time as the initial last reload label", async () => {
    render(React.createElement(Home));

    await waitFor(() =>
      expect(screen.getByText("Last reload 38s ago")).toBeTruthy(),
    );
  });

  it("persists scroll offset updates for the selected PDF", async () => {
    render(React.createElement(Home));

    await waitFor(() =>
      expect(typeof viewerPropsLog.at(-1)?.onScrollChange).toBe("function"),
    );

    vi.useFakeTimers();

    const onScrollChange = viewerPropsLog.at(-1)?.onScrollChange as
      | ((offset: { x: number; y: number }) => void)
      | undefined;

    act(() => {
      onScrollChange?.({ x: 33, y: 480 });
      vi.runAllTimers();
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(storeSetMock).toHaveBeenCalledWith("scrollOffsets", {
      "/tmp/report.pdf": { x: 33, y: 480 },
    });
  });
});

describe("Home settings auto-hide on PDF availability", () => {
  const initialLastModifiedMs = Date.parse("2026-04-17T12:34:56.000Z");
  const fixedNowMs = initialLastModifiedMs + 5_000;
  const watchedPath = "/tmp/report.pdf";
  const listeners = new Map<string, (event: { payload: unknown }) => void>();
  let dateNowSpy: ReturnType<typeof vi.spyOn> | null = null;

  const emitPdfState = (status: "updated" | "removed" | "error") =>
    act(() => {
      listeners.get("pdf-file-state")?.({
        payload: {
          path: watchedPath,
          fileName: "report.pdf",
          revision: 8,
          status,
          message: null,
        },
      });
    });

  beforeEach(() => {
    listeners.clear();
    dateNowSpy = vi.spyOn(Date, "now").mockReturnValue(fixedNowMs);

    listenMock.mockReset();
    listenMock.mockImplementation(
      (event: string, handler: (e: { payload: unknown }) => void) => {
        listeners.set(event, handler);
        return Promise.resolve(() => {});
      },
    );

    invokeMock.mockReset();
    invokeMock.mockImplementation((command: string, payload: { path: string }) => {
      if (command === "watch_pdf_path") {
        return Promise.resolve({
          path: payload.path,
          fileName: "report.pdf",
          revision: 7,
          lastModifiedMs: initialLastModifiedMs,
        });
      }
      if (command === "check_history_paths") return Promise.resolve([]);
      if (command === "set_active_hooks" || command === "set_history_watchers") {
        return Promise.resolve(undefined);
      }
      return Promise.reject(new Error(`Unhandled command: ${command}`));
    });

    storeGetMock.mockReset();
    storeGetMock.mockImplementation((key: string) => {
      if (key === "watchPath") return watchedPath;
      if (key === "zoom") return 1;
      if (key === "watchHistory") return [];
      if (key === "scrollOffsets") return {};
      if (key === "theme") return "light";
      return undefined;
    });

    storeSetMock.mockReset();
    storeCloseMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    dateNowSpy?.mockRestore();
    dateNowSpy = null;
    cleanup();
    vi.clearAllMocks();
  });

  const renderRestored = async () => {
    render(React.createElement(Home));
    await waitFor(() => expect(listeners.has("pdf-file-state")).toBe(true));
    await waitFor(() =>
      expect(screen.getByTestId("mock-pdf-viewer")).toBeTruthy(),
    );
  };

  it("auto-hides the force-opened settings sheet once the PDF is available again", async () => {
    await renderRestored();
    expect(screen.queryByRole("dialog")).toBeNull();

    emitPdfState("removed");
    expect(screen.getByRole("dialog")).toBeTruthy();

    emitPdfState("updated");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("keeps a manually opened settings sheet open when the PDF updates", async () => {
    await renderRestored();

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByRole("dialog")).toBeTruthy();

    emitPdfState("updated");
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("does not open settings when the PDF updates without a prior outage", async () => {
    await renderRestored();
    expect(screen.queryByRole("dialog")).toBeNull();

    emitPdfState("updated");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
