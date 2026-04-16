import React from "react";
import { act, cleanup, render, waitFor } from "@testing-library/react";
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
  beforeEach(() => {
    viewerPropsLog.length = 0;

    listenMock.mockReset();
    listenMock.mockResolvedValue(() => {});

    invokeMock.mockReset();
    invokeMock.mockImplementation((command: string, payload: { path: string }) => {
      if (command === "watch_pdf_path") {
        return Promise.resolve({
          path: payload.path,
          fileName: "report.pdf",
          revision: 7,
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
    cleanup();
    vi.clearAllMocks();
  });

  it("hydrates the saved scroll offset into the viewer when restoring the watched PDF", async () => {
    render(React.createElement(Home));

    await waitFor(() =>
      expect(viewerPropsLog.at(-1)?.initialScrollOffset).toEqual({ x: 12, y: 240 }),
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
